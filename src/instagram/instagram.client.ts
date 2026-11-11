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
 * el club autoriza su cuenta en Facebook Login para empresas y se publica con el token de usuario del sistema.
 */
export class InstagramClient {
  authorizationUrl(state: string) {
    const c = igConfig();
    const q = new URLSearchParams({
      client_id: c.appId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      override_default_response_type: 'true',
      state,
    });
    if (c.configId) q.set('config_id', c.configId);
    else q.set('scope', IG_SCOPES.join(','));
    return `https://www.facebook.com/${API_VERSION}/dialog/oauth?${q.toString()}`;
  }

  /**
   * Código → token de usuario del sistema (no vence) atado a las cuentas de Instagram que el club autorizó.
   * La cuenta se obtiene de los permisos granulares del token (debug_token).
   */
  async connect(
    code: string,
  ): Promise<{
    accessToken: string;
    igUserId: string;
    username: string | null;
  }> {
    const c = igConfig();
    const tok = await parse(
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
    const accessToken = String(tok.access_token);
    const dbg = await parse(
      await fetch(
        `${GRAPH}/debug_token?${new URLSearchParams({ input_token: accessToken, access_token: `${c.appId}|${c.appSecret}` })}`,
        { signal: AbortSignal.timeout(10_000) },
      ),
      'permisos del token',
    );
    const scopes = (dbg.data?.granular_scopes ?? []) as {
      scope: string;
      target_ids?: string[];
    }[];
    const igUserId =
      scopes.find((s) => s.scope === 'instagram_content_publish')
        ?.target_ids?.[0] ??
      scopes.find((s) => s.scope === 'instagram_basic')?.target_ids?.[0];
    if (!igUserId)
      throw new BadGatewayException(
        'SIN_CUENTA_PROFESIONAL',
      );
    const me = await fetch(
      `${GRAPH}/${igUserId}?${new URLSearchParams({ fields: 'username', access_token: accessToken })}`,
      {
        signal: AbortSignal.timeout(10_000),
      },
    )
      .then((r) => r.json() as Promise<Json>)
      .catch(() => ({}) as Json);
    return {
      accessToken,
      igUserId: String(igUserId),
      username: me.username ? String(me.username) : null,
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
