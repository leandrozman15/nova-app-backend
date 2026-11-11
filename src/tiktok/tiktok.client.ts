import { BadGatewayException } from '@nestjs/common';

const API = 'https://open.tiktokapis.com';
const DEFAULT_PUBLIC_API_URL = 'https://nova-app-backend.onrender.com';
/** Tope de TikTok para subir un video en un solo bloque. */
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish'];

export function tiktokConfig() {
  const publicApiUrl = (
    process.env.PUBLIC_API_URL || DEFAULT_PUBLIC_API_URL
  ).replace(/\/$/, '');
  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY ?? '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? '',
    redirectUri:
      process.env.TIKTOK_REDIRECT_URI || `${publicApiUrl}/tiktok/oauth/callback`,
  };
}

export function isTiktokConfigured() {
  const c = tiktokConfig();
  return Boolean(
    c.clientKey && c.clientSecret && process.env.PAYMENT_TOKENS_KEY,
  );
}

type Json = Record<string, any>;

export type TiktokTokens = {
  openId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

async function parse(res: Response, what: string): Promise<Json> {
  const body = (await res.json().catch(() => ({}))) as Json;
  const code = body.error?.code ?? body.error;
  const failed = !res.ok || (code && code !== 'ok');
  if (failed) {
    const detail =
      body.error?.message ?? body.error_description ?? `HTTP ${res.status}`;
    throw new BadGatewayException(`TikTok (${what}): ${detail}`);
  }
  return body;
}

const toTokens = (b: Json): TiktokTokens => ({
  openId: String(b.open_id),
  accessToken: String(b.access_token),
  refreshToken: String(b.refresh_token),
  accessExpiresAt: new Date(Date.now() + Number(b.expires_in ?? 86400) * 1000),
  refreshExpiresAt: new Date(
    Date.now() + Number(b.refresh_expires_in ?? 31536000) * 1000,
  ),
});

/** Cliente mínimo de TikTok: inicio de sesión (Login Kit) y publicación de videos (Content Posting API). */
export class TiktokClient {
  authorizationUrl(state: string) {
    const c = tiktokConfig();
    const q = new URLSearchParams({
      client_key: c.clientKey,
      scope: TIKTOK_SCOPES.join(','),
      response_type: 'code',
      redirect_uri: c.redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${q.toString()}`;
  }

  private async token(params: Record<string, string>, what: string) {
    const c = tiktokConfig();
    return toTokens(
      await parse(
        await fetch(`${API}/v2/oauth/token/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: c.clientKey,
            client_secret: c.clientSecret,
            ...params,
          }),
          signal: AbortSignal.timeout(10_000),
        }),
        what,
      ),
    );
  }

  exchange(code: string) {
    return this.token(
      {
        code,
        grant_type: 'authorization_code',
        redirect_uri: tiktokConfig().redirectUri,
      },
      'canje del código',
    );
  }

  refresh(refreshToken: string) {
    return this.token(
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      'renovar el acceso',
    );
  }

  async displayName(accessToken: string): Promise<string | null> {
    const b = await fetch(
      `${API}/v2/user/info/?fields=open_id,display_name`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      },
    )
      .then((r) => r.json() as Promise<Json>)
      .catch(() => ({}) as Json);
    return b.data?.user?.display_name ? String(b.data.user.display_name) : null;
  }

  private auth(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    };
  }

  /**
   * Descarga el video del almacenamiento de la app y lo sube a TikTok (FILE_UPLOAD):
   * TikTok solo toma por URL desde dominios verificados, y el del almacenamiento no lo es.
   * Mientras la app no pase la auditoría de TikTok, la publicación queda privada (solo el autor).
   */
  async publishVideo(
    accessToken: string,
    input: { url: string; title: string },
  ): Promise<{ publishId: string; privacy: string }> {
    const creator = await parse(
      await fetch(`${API}/v2/post/publish/creator_info/query/`, {
        method: 'POST',
        headers: this.auth(accessToken),
        signal: AbortSignal.timeout(10_000),
      }),
      'datos del creador',
    );
    const options = (creator.data?.privacy_level_options ?? []) as string[];
    const privacy = options.includes('PUBLIC_TO_EVERYONE')
      ? 'PUBLIC_TO_EVERYONE'
      : (options[0] ?? 'SELF_ONLY');

    const file = await fetch(input.url, { signal: AbortSignal.timeout(60_000) });
    if (!file.ok)
      throw new BadGatewayException('No se pudo leer el video del club');
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES)
      throw new BadGatewayException(
        'El video tiene que pesar menos de 64 MB para TikTok',
      );

    const init = await parse(
      await fetch(`${API}/v2/post/publish/video/init/`, {
        method: 'POST',
        headers: this.auth(accessToken),
        body: JSON.stringify({
          post_info: { title: input.title, privacy_level: privacy },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: bytes.length,
            chunk_size: bytes.length,
            total_chunk_count: 1,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      }),
      'iniciar la publicación',
    );
    const publishId = String(init.data?.publish_id);
    const uploadUrl = String(init.data?.upload_url);

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.headers.get('content-type') || 'video/mp4',
        'Content-Length': String(bytes.length),
        'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
      },
      body: bytes,
      signal: AbortSignal.timeout(120_000),
    });
    if (!put.ok)
      throw new BadGatewayException(`TikTok (subir el video): HTTP ${put.status}`);

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await parse(
        await fetch(`${API}/v2/post/publish/status/fetch/`, {
          method: 'POST',
          headers: this.auth(accessToken),
          body: JSON.stringify({ publish_id: publishId }),
          signal: AbortSignal.timeout(10_000),
        }),
        'estado de la publicación',
      );
      const s = String(st.data?.status ?? '');
      if (s === 'PUBLISH_COMPLETE') return { publishId, privacy };
      if (s === 'FAILED')
        throw new BadGatewayException(
          `TikTok no pudo publicar el video (${st.data?.fail_reason ?? 'sin detalle'})`,
        );
    }
    // Sigue procesándose: TikTok lo termina solo.
    return { publishId, privacy };
  }
}
