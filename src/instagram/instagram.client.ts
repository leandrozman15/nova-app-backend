import { BadGatewayException } from '@nestjs/common';

const GRAPH = 'https://graph.instagram.com';
const API_VERSION = 'v22.0';
const DEFAULT_PUBLIC_API_URL = 'https://nova-app-backend.onrender.com';

export const IG_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
];

export function igConfig() {
  const publicApiUrl = (
    process.env.PUBLIC_API_URL || DEFAULT_PUBLIC_API_URL
  ).replace(/\/$/, '');
  return {
    appId: process.env.INSTAGRAM_APP_ID ?? '',
    appSecret: process.env.INSTAGRAM_APP_SECRET ?? '',
    redirectUri:
      process.env.INSTAGRAM_REDIRECT_URI ||
      `${publicApiUrl}/instagram/oauth/callback`,
  };
}

export function isInstagramConfigured() {
  const c = igConfig();
  return Boolean(c.appId && c.appSecret && process.env.PAYMENT_TOKENS_KEY);
}

type Json = Record<string, any>;

async function parse(res: Response, what: string): Promise<Json> {
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || body.error || body.error_message) {
    const detail =
      body.error?.message ?? body.error_message ?? `HTTP ${res.status}`;
    throw new BadGatewayException(`Instagram (${what}): ${detail}`);
  }
  return body;
}

/** Cliente mínimo de la API de Instagram con inicio de sesión de Instagram (cuentas profesionales). */
export class InstagramClient {
  authorizationUrl(state: string) {
    const c = igConfig();
    const q = new URLSearchParams({
      client_id: c.appId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      scope: IG_SCOPES.join(','),
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
  }

  /** Código → token corto → token largo (~60 días). */
  async exchangeCode(rawCode: string) {
    const c = igConfig();
    const code = rawCode.replace(/#_$/, '');
    const short = await parse(
      await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: c.appId,
          client_secret: c.appSecret,
          grant_type: 'authorization_code',
          redirect_uri: c.redirectUri,
          code,
        }),
        signal: AbortSignal.timeout(10_000),
      }),
      'canje del código',
    );
    const first = Array.isArray(short.data) ? short.data[0] : short;
    const long = await parse(
      await fetch(
        `${GRAPH}/access_token?${new URLSearchParams({
          grant_type: 'ig_exchange_token',
          client_secret: c.appSecret,
          access_token: String(first.access_token),
        })}`,
        { signal: AbortSignal.timeout(10_000) },
      ),
      'token de larga duración',
    );
    return {
      accessToken: String(long.access_token),
      expiresInSec: Number(long.expires_in ?? 0),
      igUserId: String(first.user_id),
    };
  }

  async refresh(token: string) {
    const r = await parse(
      await fetch(
        `${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`,
        { signal: AbortSignal.timeout(10_000) },
      ),
      'renovación del token',
    );
    return {
      accessToken: String(r.access_token),
      expiresInSec: Number(r.expires_in ?? 0),
    };
  }

  async me(token: string) {
    const r = await parse(
      await fetch(
        `${GRAPH}/${API_VERSION}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: token })}`,
        {
          signal: AbortSignal.timeout(10_000),
        },
      ),
      'datos de la cuenta',
    );
    return {
      igUserId: String(r.user_id ?? r.id),
      username: r.username ? String(r.username) : null,
    };
  }

  private async post(
    path: string,
    token: string,
    params: Record<string, string>,
    what: string,
  ) {
    return parse(
      await fetch(`${GRAPH}/${API_VERSION}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(20_000),
      }),
      what,
    );
  }

  /** Crea el contenedor y lo publica. Los videos (reels) se procesan primero; se espera hasta ~2 min. */
  async publish(
    igUserId: string,
    token: string,
    media: { kind: 'image' | 'video'; url: string; caption: string },
  ): Promise<{ mediaId: string }> {
    const params: Record<string, string> = { caption: media.caption };
    if (media.kind === 'image') params.image_url = media.url;
    else {
      params.media_type = 'REELS';
      params.video_url = media.url;
    }
    const container = await this.post(
      `${igUserId}/media`,
      token,
      params,
      'crear la publicación',
    );
    const id = String(container.id);

    if (media.kind === 'video') {
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const st = await parse(
          await fetch(
            `${GRAPH}/${API_VERSION}/${id}?${new URLSearchParams({ fields: 'status_code' })}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(10_000),
            },
          ),
          'estado del video',
        );
        if (st.status_code === 'FINISHED') break;
        if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED')
          throw new BadGatewayException('Instagram no pudo procesar el video');
        if (i === 23)
          throw new BadGatewayException(
            'Instagram tardó demasiado en procesar el video',
          );
      }
    }
    const published = await this.post(
      `${igUserId}/media_publish`,
      token,
      { creation_id: id },
      'publicar',
    );
    return { mediaId: String(published.id) };
  }
}
