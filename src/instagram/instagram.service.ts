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
  decryptSecret,
  encryptSecret,
  signState,
  verifyState,
} from '../payments/token-crypto';
import { InstagramClient, isInstagramConfigured } from './instagram.client';
import { buildCaption, validateMediaUrl } from './instagram-rules';

type OAuthState = {
  clubId: string;
  companyId: string;
  uid: string;
  exp: number;
  nonce: string;
};

const STATE_TTL_MS = 15 * 60 * 1000;
const REFRESH_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly ig = new InstagramClient();

  constructor(private readonly prisma: PrismaService) {}

  private assertConfigured() {
    if (!isInstagramConfigured())
      throw new ServiceUnavailableException(
        'La conexión con Instagram todavía no está habilitada en la plataforma.',
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
    const a = await this.prisma.clubInstagramAccount.findUnique({
      where: { clubId },
      select: {
        username: true,
        igUserId: true,
        expiresAt: true,
        createdAt: true,
        lastPublishedAt: true,
      },
    });
    return {
      available: isInstagramConfigured(),
      connected: Boolean(a),
      username: a?.username ?? null,
      connectedAt: a?.createdAt ?? null,
      lastPublishedAt: a?.lastPublishedAt ?? null,
      expiresAt: a?.expiresAt ?? null,
      expired: a?.expiresAt ? a.expiresAt.getTime() < Date.now() : false,
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
    return { url: this.ig.authorizationUrl(state) };
  }

  async handleCallback(code: string | undefined, rawState: string | undefined) {
    this.assertConfigured();
    if (!code || !rawState)
      throw new BadRequestException('Faltan datos de Instagram');
    const state = verifyState<OAuthState>(rawState);
    if (!state || state.exp < Date.now())
      throw new BadRequestException(
        'El enlace de conexión venció. Probá de nuevo.',
      );
    await this.requireClub(state.companyId, state.clubId);

    const token = await this.ig.exchangeCode(code);
    const me = await this.ig
      .me(token.accessToken)
      .catch(() => ({ igUserId: token.igUserId, username: null }));
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: state.uid },
      select: { id: true },
    });
    const data = {
      companyId: state.companyId,
      igUserId: me.igUserId || token.igUserId,
      username: me.username,
      accessTokenEncrypted: encryptSecret(token.accessToken),
      expiresAt: token.expiresInSec
        ? new Date(Date.now() + token.expiresInSec * 1000)
        : null,
      connectedByUserId: user?.id ?? null,
    };
    await this.prisma.clubInstagramAccount.upsert({
      where: { clubId: state.clubId },
      update: data,
      create: { ...data, clubId: state.clubId },
    });
    this.logger.log(`Instagram conectado para el club ${state.clubId}`);
    return { clubId: state.clubId };
  }

  async disconnect(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    await this.prisma.clubInstagramAccount.deleteMany({ where: { clubId } });
    return { ok: true };
  }

  /** Token vigente; si vence pronto lo renueva (los de ~60 días se pueden renovar pasadas 24 h). */
  private async token(clubId: string, companyId: string) {
    const a = await this.prisma.clubInstagramAccount.findFirst({
      where: { clubId, companyId },
    });
    if (!a)
      throw new ConflictException('Este club no tiene Instagram conectado');
    if (a.expiresAt && a.expiresAt.getTime() < Date.now())
      throw new ConflictException(
        'La conexión con Instagram venció. Volvé a conectarla desde Configuración.',
      );
    let token = decryptSecret(a.accessTokenEncrypted);
    if (a.expiresAt && a.expiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS) {
      try {
        const r = await this.ig.refresh(token);
        token = r.accessToken;
        await this.prisma.clubInstagramAccount.update({
          where: { id: a.id },
          data: {
            accessTokenEncrypted: encryptSecret(token),
            expiresAt: r.expiresInSec
              ? new Date(Date.now() + r.expiresInSec * 1000)
              : a.expiresAt,
          },
        });
      } catch (e) {
        this.logger.warn(
          `No se pudo renovar el token de Instagram del club ${clubId}: ${String(e)}`,
        );
      }
    }
    return { token, igUserId: a.igUserId, id: a.id };
  }

  async publish(
    companyId: string,
    clubId: string,
    input: {
      kind: 'image' | 'video';
      url: string;
      title?: string;
      body?: string;
    },
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
    const caption = buildCaption(input.title ?? '', input.body ?? '');
    const { token, igUserId, id } = await this.token(clubId, companyId);
    const { mediaId } = await this.ig.publish(igUserId, token, {
      kind: input.kind,
      url: input.url,
      caption,
    });
    await this.prisma.clubInstagramAccount.update({
      where: { id },
      data: { lastPublishedAt: new Date() },
    });
    return { mediaId };
  }
}
