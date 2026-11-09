import { BadGatewayException } from '@nestjs/common';

const API_VERSION = 'v22.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
const DEFAULT_PUBLIC_API_URL = 'https://nova-app-backend.onrender.com';

/** Permisos del inicio de sesión unificado (Facebook) para publicar en la cuenta profesional de Instagram. */
export const IG_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
];

export function igConfig() {
  const publicApiUrl = (
    process.env.PUBLIC_API_URL || DEFAULT_PUBLIC_API_URL
  ).replace(/\/$/, '');
  return {
    appId: process.env.INSTAGRAM_APP_ID ?? '',
    appSecret: process.env.INSTAGRAM_APP_SECRET ?? '',
    /** Opcional: id de la configuración de "Facebook Login para empresas" creada en el panel de Meta. */
    configId: process.env.INSTAGRAM_CONFIG_ID ?? '',
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
  if (!res.ok || body.error) {
    const detail = body.error?.message ?? `HTTP ${res.status}`;
    throw new BadGatewayException(`Instagram (${what}): ${detail}`);
  }
  return body;
}

/**
 * Cliente mínimo de la API de Instagram con inicio de sesión unificado:
 * el usuario autoriza en Facebook, y se publica con el token de la página vinculada a la cuenta profesional.
 */
export class InstagramClient {
  authorizationUrl(state: string) {
    const c = igConfig();
    const q = new URLSearchParams({
      client_id: c.appId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      state,
    });
    if (c.configId) q.set('config_id', c.configId);
    else q.set('scope', IG_SCOPES.join(','));
    return `https://www.facebook.com/${API_VERSION}/dialog/oauth?${q.toString()}`;
  }

  /**
   * Código → token de usuario corto → largo (~60 días) → token de la página con Instagram vinculado.
   * El token de página derivado de uno largo no vence.
   */
  async connect(
    code: string,
  ): Promise<{
    accessToken: string;
    igUserId: string;
    username: string | null;
    pageName: string | null;
  }> {
    const c = igConfig();
    const short = await parse(
      await fetch(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          client_id: c.appId,
          client_secret: c.appSecret,
          redirect_uri: c.redirectUri,
          code,
        })}`,
        { signal: AbortSignal.timeout(10_000) },
      ),
      'canje del código',
    );
    const long = await parse(
      await fetch(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: c.appId,
          client_secret: c.appSecret,
          fb_exchange_token: String(short.access_token),
        })}`,
        { signal: AbortSignal.timeout(10_000) },
      ),
      'token de larga duración',
    );
    const pages = await parse(
      await fetch(
        `${GRAPH}/me/accounts?${new URLSearchParams({
          fields: 'name,access_token,instagram_business_account{id,username}',
          limit: '50',
          access_token: String(long.access_token),
        })}`,
        { signal: AbortSignal.timeout(10_000) },
      ),
      'páginas vinculadas',
    );
    const page = (pages.data as Json[] | undefined)?.find(
      (p) => p.instagram_business_account?.id,
    );
    if (!page)
      throw new BadGatewayException(
        'No encontramos una cuenta profesional de Instagram vinculada a una página de Facebook que administres.',
      );
    return {
      accessToken: String(page.access_token),
      igUserId: String(page.instagram_business_account.id),
      username: page.instagram_business_account.username
        ? String(page.instagram_business_account.username)
        : null,
      pageName: page.name ? String(page.name) : null,
    };
  }

  private async post(
    path: string,
    token: string,
    params: Record<string, string>,
    what: string,
  ) {
    return parse(
      await fetch(`${GRAPH}/${path}`, {
        method: 'POST',
        body: new URLSearchParams({ ...params, access_token: token }),
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
            `${GRAPH}/${id}?${new URLSearchParams({ fields: 'status_code', access_token: token })}`,
            {
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
