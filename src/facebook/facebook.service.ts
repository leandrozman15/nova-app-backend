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
import { buildCaption } from '../instagram/instagram-rules';
import { isPublicMediaUrl } from '../common/validation/public-media-url';
import { FacebookClient, isFacebookConfigured } from './facebook.client';

type OAuthState = {
  clubId: string;
  companyId: string;
  uid: string;
  exp: number;
  nonce: string;
};

const STATE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly fb = new FacebookClient();

  constructor(private readonly prisma: PrismaService) {}

  private assertConfigured() {
    if (!isFacebookConfigured())
      throw new ServiceUnavailableException(
        'La conexión con Facebook todavía no está habilitada en la plataforma.',
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
    const a = await this.prisma.clubFacebookPage.findUnique({
      where: { clubId },
      select: { pageName: true, createdAt: true, lastPublishedAt: true },
    });
    return {
      available: isFacebookConfigured(),
      connected: Boolean(a),
      pageName: a?.pageName ?? null,
      connectedAt: a?.createdAt ?? null,
      lastPublishedAt: a?.lastPublishedAt ?? null,
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
    return { url: this.fb.authorizationUrl(state) };
  }

  async handleCallback(code: string | undefined, rawState: string | undefined) {
    this.assertConfigured();
    if (!code || !rawState)
      throw new BadRequestException('Faltan datos de Facebook');
    const state = verifyState<OAuthState>(rawState);
    if (!state || state.exp < Date.now())
      throw new BadRequestException(
        'El enlace de conexión venció. Probá de nuevo.',
      );
    await this.requireClub(state.companyId, state.clubId);

    const conn = await this.fb.connect(code.replace(/#_$/, ''));
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: state.uid },
      select: { id: true },
    });
    const data = {
      companyId: state.companyId,
      pageId: conn.pageId,
      pageName: conn.pageName,
      accessTokenEncrypted: encryptSecret(conn.accessToken),
      connectedByUserId: user?.id ?? null,
    };
    await this.prisma.clubFacebookPage.upsert({
      where: { clubId: state.clubId },
      update: data,
      create: { ...data, clubId: state.clubId },
    });
    this.logger.log(`Facebook conectado para el club ${state.clubId}`);
    return { clubId: state.clubId };
  }

  async disconnect(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    await this.prisma.clubFacebookPage.deleteMany({ where: { clubId } });
    return { ok: true };
  }

  async publish(
    companyId: string,
    clubId: string,
    input: {
      kind: 'image' | 'video' | 'text';
      url?: string;
      title?: string;
      body?: string;
    },
  ) {
    this.assertConfigured();
    await this.requireClub(companyId, clubId);
    if (input.kind !== 'text') {
      if (!input.url || !isPublicMediaUrl(input.url))
        throw new BadRequestException(
          'El archivo tiene que estar en el almacenamiento de la app',
        );
    }
    const a = await this.prisma.clubFacebookPage.findFirst({
      where: { clubId, companyId },
    });
    if (!a)
      throw new ConflictException('Este club no tiene Facebook conectado');
    const message = buildCaption(input.title ?? '', input.body ?? '');
    const { postId } = await this.fb.publish(
      a.pageId,
      decryptSecret(a.accessTokenEncrypted),
      {
        kind: input.kind,
        url: input.url,
        message,
      },
    );
    await this.prisma.clubFacebookPage.update({
      where: { id: a.id },
      data: { lastPublishedAt: new Date() },
    });
    return { postId };
  }
}
