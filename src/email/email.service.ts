import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

const RESEND_URL = 'https://api.resend.com/emails';

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export const isEmailConfigured = () =>
  Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());

/** Dominio del remitente (`Club <avisos@dominio.com>` o `avisos@dominio.com`), para mostrarlo en Integraciones. */
export const senderDomain = (from: string | undefined) => {
  const m = from?.match(/@([^>\s]+)>?\s*$/);
  return m ? m[1].toLowerCase() : null;
};

/** Envío de correo transaccional desde Fluxion (Resend por HTTP; sin dependencias nuevas). */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  status() {
    const from = process.env.EMAIL_FROM?.trim() || null;
    return {
      available: isEmailConfigured(),
      from,
      domain: senderDomain(from ?? undefined),
      provider: 'resend',
    };
  }

  async send(msg: EmailMessage): Promise<{ id: string | null }> {
    if (!isEmailConfigured())
      throw new ServiceUnavailableException(
        'El envío de emails todavía no está habilitado en la plataforma.',
      );
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: msg.replyTo,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      this.logger.warn(`Resend ${res.status}: ${body.message ?? 'sin detalle'}`);
      throw new BadGatewayException(
        `No se pudo enviar el email (${body.message ?? res.status}).`,
      );
    }
    return { id: body.id ?? null };
  }
}
