import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { buildCaption, validateMediaUrl } from '../instagram/instagram-rules';
import {
  decryptSecret,
  encryptSecret,
  signState,
  verifyState,
} from '../payments/token-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TiktokClient, isTiktokConfigured } from './tiktok.client';

type OAuthState = {
  clubId: string;
  companyId: string;
  uid: string;
  exp: number;
  nonce: string;
};

const STATE_TTL_MS = 15 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);
  private readonly tt = new TiktokClient();

  constructor(private readonly prisma: PrismaService) {}

  private assertConfigured() {
    if (!isTiktokConfigured())
      throw new ServiceUnavailableException(
        'La conexión con TikTok todavía no está habilitada en la plataforma.',
      );
  }

  private async requireClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club not found');
  }

  async status(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    const a = await this.prisma.clubTiktokAccount.findUnique({
      where: { clubId },
      select: {
        displayName: true,
        refreshExpiresAt: true,
        createdAt: true,
        lastPublishedAt: true,
      },
    });
    return {
      available: isTiktokConfigured(),
      connected: Boolean(a),
      displayName: a?.displayName ?? null,
      connectedAt: a?.createdAt ?? null,
      lastPublishedAt: a?.lastPublishedAt ?? null,
      expired: a ? a.refreshExpiresAt.getTime() < Date.now() : false,
    };
  }

  async connectUrl(companyId: string, clubId: string, uid: string) {
    this.assertConfigured();
    await this.requireClub(companyId, clubId);
    const state = signState({
      clubId,
      companyId,
      uid,
      exp: Date.now() + STATE_TTL_MS,
      nonce: randomBytes(12).toString('base64url'),
    } satisfies OAuthState);
    return { url: this.tt.authorizationUrl(state) };
  }

  async handleCallback(code: string | undefined, rawState: string | undefined) {
    this.assertConfigured();
    if (!code || !rawState)
      throw new BadRequestException('Faltan datos de TikTok');
    const state = verifyState<OAuthState>(rawState);
    if (!state || state.exp < Date.now())
      throw new BadRequestException(
        'El enlace de conexión venció. Probá de nuevo.',
      );
    await this.requireClub(state.companyId, state.clubId);

    const t = await this.tt.exchange(decodeURIComponent(code));
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: state.uid },
      select: { id: true },
    });
    const data = {
      companyId: state.companyId,
      openId: t.openId,
      displayName: await this.tt.displayName(t.accessToken),
      accessTokenEncrypted: encryptSecret(t.accessToken),
      refreshTokenEncrypted: encryptSecret(t.refreshToken),
      accessExpiresAt: t.accessExpiresAt,
      refreshExpiresAt: t.refreshExpiresAt,
      connectedByUserId: user?.id ?? null,
    };
    await this.prisma.clubTiktokAccount.upsert({
      where: { clubId: state.clubId },
      update: data,
      create: { ...data, clubId: state.clubId },
    });
    this.logger.log(`TikTok conectado para el club ${state.clubId}`);
    return { clubId: state.clubId };
  }

  /** Club del `state` firmado, para volver a su pantalla aun cuando la conexión falle o se cancele. */
  clubIdFromState(rawState: string | undefined): string | null {
    if (!rawState) return null;
    return verifyState<OAuthState>(rawState)?.clubId ?? null;
  }

  async disconnect(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    await this.prisma.clubTiktokAccount.deleteMany({ where: { clubId } });
    return { ok: true };
  }

  /** Token de acceso vigente; el de TikTok dura 24 h y se renueva solo con el refresh token. */
  private async accessToken(clubId: string, companyId: string) {
    const a = await this.prisma.clubTiktokAccount.findFirst({
      where: { clubId, companyId },
    });
    if (!a) throw new ConflictException('Este club no tiene TikTok conectado');
    if (a.accessExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS)
      return { token: decryptSecret(a.accessTokenEncrypted), id: a.id };
    if (a.refreshExpiresAt.getTime() < Date.now())
      throw new ConflictException(
        'La conexión con TikTok venció. Volvé a conectar la cuenta.',
      );
    const t = await this.tt.refresh(decryptSecret(a.refreshTokenEncrypted));
    await this.prisma.clubTiktokAccount.update({
      where: { id: a.id },
      data: {
        accessTokenEncrypted: encryptSecret(t.accessToken),
        refreshTokenEncrypted: encryptSecret(t.refreshToken),
        accessExpiresAt: t.accessExpiresAt,
        refreshExpiresAt: t.refreshExpiresAt,
      },
    });
    return { token: t.accessToken, id: a.id };
  }

  async publish(
    companyId: string,
    clubId: string,
    input: { url: string; title?: string; body?: string },
  ) {
    this.assertConfigured();
    await this.requireClub(companyId, clubId);
    try {
      validateMediaUrl(input.url);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Archivo inválido',
      );
    }
    const { token, id } = await this.accessToken(clubId, companyId);
    const result = await this.tt.publishVideo(token, {
      url: input.url,
      title: buildCaption(input.title ?? '', input.body ?? ''),
    });
    await this.prisma.clubTiktokAccount.update({
      where: { id },
      data: { lastPublishedAt: new Date() },
    });
    return result;
  }
}
