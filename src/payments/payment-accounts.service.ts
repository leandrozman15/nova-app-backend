import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  isMercadoPagoConfigured,
  MercadoPagoClient,
} from './mercadopago.client';
import {
  decryptSecret,
  encryptSecret,
  signState,
  verifyState,
} from './token-crypto';

type OAuthState = {
  clubId: string;
  companyId: string;
  uid: string;
  exp: number;
  nonce: string;
  /** Enlace enviado al titular de la cuenta del club (vuelve a una página pública). */
  shared?: boolean;
};

const STATE_TTL_MS = 15 * 60 * 1000;
/** El enlace para el titular dura 48 h: lo abre otra persona, en su teléfono. */
const SHARED_STATE_TTL_MS = 48 * 60 * 60 * 1000;
// Renovar el token si vence dentro de esta ventana (duran ~180 días).
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class PaymentAccountsService {
  private readonly logger = new Logger(PaymentAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoClient,
  ) {}

  private assertConfigured() {
    if (!isMercadoPagoConfigured()) {
      throw new ServiceUnavailableException(
        'Los cobros con Mercado Pago todavía no están habilitados en la plataforma.',
      );
    }
  }

  async status(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    const account = await this.prisma.clubPaymentAccount.findUnique({
      where: { clubId },
      select: {
        providerUserId: true,
        providerNickname: true,
        providerEmail: true,
        liveMode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    // La misma cuenta de Mercado Pago conectada en otros clubes: casi siempre es un error
    // (se conectó la cuenta que estaba abierta en el navegador, no la del club).
    const sharedWith = account
      ? await this.prisma.clubPaymentAccount.count({
          where: { providerUserId: account.providerUserId, clubId: { not: clubId } },
        })
      : 0;
    return {
      available: isMercadoPagoConfigured(),
      connected: Boolean(account),
      liveMode: account?.liveMode ?? null,
      providerUserId: account?.providerUserId ?? null,
      providerNickname: account?.providerNickname ?? null,
      providerEmail: account?.providerEmail ?? null,
      sharedWithOtherClubs: sharedWith,
      connectedAt: account?.createdAt ?? null,
    };
  }

  /**
   * Enlace de autorización. Mercado Pago conecta la cuenta que tenga la sesión abierta en
   * ese navegador: con `shared`, el enlace es para mandarle al titular de la cuenta del club.
   */
  async connectUrl(companyId: string, clubId: string, uid: string, shared = false) {
    this.assertConfigured();
    await this.requireClub(companyId, clubId);
    const exp = Date.now() + (shared ? SHARED_STATE_TTL_MS : STATE_TTL_MS);
    const state = signState({
      clubId,
      companyId,
      uid,
      exp,
      nonce: randomBytes(12).toString('base64url'),
      ...(shared && { shared: true }),
    } satisfies OAuthState);
    if (shared) this.logger.log(`Enlace de Mercado Pago para el titular: club=${clubId} por=${uid}`);
    return { url: this.mp.authorizationUrl(state), expiresAt: new Date(exp).toISOString() };
  }

  /** Vuelta del OAuth: canjea el código y guarda los tokens cifrados. Devuelve el club. */
  async handleCallback(code: string | undefined, rawState: string | undefined) {
    this.assertConfigured();
    if (!code || !rawState)
      throw new BadRequestException('Faltan datos de Mercado Pago');
    const state = verifyState<OAuthState>(rawState);
    if (!state || state.exp < Date.now())
      throw new BadRequestException(
        'El enlace de conexión venció. Probá de nuevo.',
      );
    await this.requireClub(state.companyId, state.clubId);

    const token = await this.mp.exchangeCode(code);
    // Quién es la cuenta conectada, para mostrarlo en la consola (si falla, se conecta igual).
    const me = await this.mp.getMe(token.access_token).catch(() => null);
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: state.uid },
      select: { id: true },
    });
    const data = {
      companyId: state.companyId,
      providerUserId: String(token.user_id),
      providerNickname: me?.nickname ?? null,
      providerEmail: me?.email ?? null,
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: token.refresh_token
        ? encryptSecret(token.refresh_token)
        : null,
      publicKey: token.public_key ?? null,
      liveMode: Boolean(token.live_mode),
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      connectedByUserId: user?.id ?? null,
    };
    await this.prisma.clubPaymentAccount.upsert({
      where: { clubId: state.clubId },
      update: data,
      create: { ...data, clubId: state.clubId },
    });
    // Conectar Mercado Pago activa la seña online si el club no recibía reservas.
    await this.prisma.club.updateMany({
      where: { id: state.clubId, bookingMode: 'off' },
      data: { bookingMode: 'deposit' },
    });
    this.logger.log(
      `Mercado Pago conectado: club=${state.clubId} mpUser=${data.providerUserId}`,
    );

    const club = await this.prisma.club.findUnique({ where: { id: state.clubId }, select: { name: true } });
    return { clubId: state.clubId, shared: Boolean(state.shared), clubName: club?.name ?? null, account: me?.nickname ?? me?.email ?? null };
  }

  async disconnect(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    const pending = await this.prisma.booking.count({
      where: {
        clubId,
        status: 'PENDING_PAYMENT',
        holdExpiresAt: { gt: new Date() },
      },
    });
    if (pending > 0)
      throw new ConflictException(
        'Hay pagos de seña en curso. Probá de nuevo en unos minutos.',
      );
    await this.prisma.clubPaymentAccount.deleteMany({ where: { clubId } });
    return { ok: true };
  }

  async isConnected(clubId: string) {
    return (
      (await this.prisma.clubPaymentAccount.count({ where: { clubId } })) > 0
    );
  }

  /** Token vigente del club (lo renueva si está por vencer). Nunca sale de la API. */
  async accessTokenFor(clubId: string): Promise<string> {
    const account = await this.prisma.clubPaymentAccount.findUnique({
      where: { clubId },
    });
    if (!account)
      throw new NotFoundException('El club no tiene Mercado Pago conectado');

    const needsRefresh =
      account.expiresAt &&
      account.refreshTokenEncrypted &&
      account.expiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;
    if (!needsRefresh) return decryptSecret(account.accessTokenEncrypted);

    try {
      const token = await this.mp.refreshToken(
        decryptSecret(account.refreshTokenEncrypted!),
      );
      await this.prisma.clubPaymentAccount.update({
        where: { clubId },
        data: {
          accessTokenEncrypted: encryptSecret(token.access_token),
          refreshTokenEncrypted: token.refresh_token
            ? encryptSecret(token.refresh_token)
            : account.refreshTokenEncrypted,
          expiresAt: token.expires_in
            ? new Date(Date.now() + token.expires_in * 1000)
            : account.expiresAt,
        },
      });
      return token.access_token;
    } catch (error) {
      // Si la renovación falla, el token actual puede seguir vigente unos días.
      this.logger.warn(
        `No se pudo renovar el token de Mercado Pago del club ${clubId}: ${String(error)}`,
      );
      return decryptSecret(account.accessTokenEncrypted);
    }
  }

  private async requireClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
  }
}
