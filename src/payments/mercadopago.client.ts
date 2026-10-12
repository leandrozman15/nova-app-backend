import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

/**
 * Cliente mínimo de la API de Mercado Pago (Argentina). Usa fetch nativo.
 * Docs: OAuth (/oauth/token), Checkout Pro (/checkout/preferences),
 * pagos (/v1/payments/{id}) y devoluciones (/v1/payments/{id}/refunds).
 */
const API = 'https://api.mercadopago.com';
const AUTH_URL = 'https://auth.mercadopago.com/authorization';

export type MpTokenResponse = {
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id: number | string;
  expires_in?: number;
  live_mode?: boolean;
};

export type MpPreferenceInput = {
  title: string;
  amount: number;
  currency: string;
  externalReference: string;
  payerEmail?: string;
  notificationUrl: string;
  backUrl: string;
  expiresAt: Date;
};

export type MpPreference = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

export type MpPayment = {
  id: number;
  status: string; // approved | pending | in_process | rejected | cancelled | refunded | charged_back
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount: number;
  currency_id: string;
  date_approved?: string | null;
};

export function mpConfig() {
  return {
    clientId: process.env.MP_CLIENT_ID ?? '',
    clientSecret: process.env.MP_CLIENT_SECRET ?? '',
    redirectUri: process.env.MP_REDIRECT_URI ?? '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
    testMode: process.env.MP_TEST_MODE === 'true',
    publicApiUrl: (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, ''),
    publicAppUrl: (process.env.PUBLIC_APP_URL ?? '').replace(/\/$/, ''),
  };
}

export function isMercadoPagoConfigured() {
  const config = mpConfig();
  return Boolean(
    config.clientId &&
    config.clientSecret &&
    config.redirectUri &&
    config.publicApiUrl &&
    config.publicAppUrl &&
    process.env.PAYMENT_TOKENS_KEY,
  );
}

@Injectable()
export class MercadoPagoClient {
  private readonly logger = new Logger(MercadoPagoClient.name);

  authorizationUrl(state: string) {
    const { clientId, redirectUri } = mpConfig();
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('platform_id', 'mp');
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', redirectUri);
    return url.toString();
  }

  exchangeCode(code: string) {
    const { clientId, clientSecret, redirectUri, testMode } = mpConfig();
    return this.request<MpTokenResponse>('POST', '/oauth/token', undefined, {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      ...(testMode ? { test_token: true } : {}),
    });
  }

  refreshToken(refreshToken: string) {
    const { clientId, clientSecret } = mpConfig();
    return this.request<MpTokenResponse>('POST', '/oauth/token', undefined, {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
  }

  createPreference(accessToken: string, input: MpPreferenceInput) {
    return this.request<MpPreference>(
      'POST',
      '/checkout/preferences',
      accessToken,
      {
        items: [
          {
            id: input.externalReference,
            title: input.title,
            quantity: 1,
            unit_price: input.amount,
            currency_id: input.currency,
          },
        ],
        external_reference: input.externalReference,
        notification_url: input.notificationUrl,
        back_urls: {
          success: input.backUrl,
          pending: input.backUrl,
          failure: input.backUrl,
        },
        auto_return: 'approved',
        expires: true,
        expiration_date_to: input.expiresAt.toISOString(),
        // El pago tiene que acreditarse dentro de la retención del turno (sin efectivo/ticket).
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
        },
        binary_mode: true,
        ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
        statement_descriptor: 'FLUXION SPORT',
      },
      `pref-${input.externalReference}`,
    );
  }

  getPayment(accessToken: string, paymentId: string) {
    return this.request<MpPayment>(
      'GET',
      `/v1/payments/${encodeURIComponent(paymentId)}`,
      accessToken,
    );
  }

  refundPayment(accessToken: string, paymentId: string) {
    return this.request<{ id: number; status: string }>(
      'POST',
      `/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
      accessToken,
      {},
      `refund-${paymentId}`,
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    accessToken?: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;

    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.error(
        `Mercado Pago ${method} ${path} sin respuesta: ${String(error)}`,
      );
      throw new BadGatewayException(
        'Mercado Pago no respondió. Probá de nuevo en un momento.',
      );
    }

    const text = await response.text();
    if (!response.ok) {
      // Nunca loguear el cuerpo del pedido (puede contener tokens o secretos).
      this.logger.warn(
        `Mercado Pago ${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`,
      );
      throw new BadGatewayException('Mercado Pago rechazó la operación.');
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}
