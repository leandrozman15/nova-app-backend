import { BadGatewayException } from '@nestjs/common';

import { igConfig } from '../instagram/instagram.client';

const API_VERSION = 'v22.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
const DEFAULT_PUBLIC_API_URL = 'https://nova-app-backend.onrender.com';

export const FB_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
];

export function fbConfig() {
  const base = igConfig();
  const publicApiUrl = (
    process.env.PUBLIC_API_URL || DEFAULT_PUBLIC_API_URL
  ).replace(/\/$/, '');
  return {
    appId: base.appId,
    appSecret: base.appSecret,
    /** Configuración de "Facebook Login para empresas" con el activo Páginas. */
    configId: process.env.FACEBOOK_CONFIG_ID ?? '',
    redirectUri:
      process.env.FACEBOOK_REDIRECT_URI ||
      `${publicApiUrl}/facebook/oauth/callback`,
  };
}

export function isFacebookConfigured() {
  const c = fbConfig();
  return Boolean(
    c.appId && c.appSecret && c.configId && process.env.PAYMENT_TOKENS_KEY,
  );
}

type Json = Record<string, any>;

async function parse(res: Response, what: string): Promise<Json> {
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || body.error)
    throw new BadGatewayException(
      `Facebook (${what}): ${body.error?.message ?? `HTTP ${res.status}`}`,
    );
  return body;
}

/** Cliente mínimo para publicar en una página de Facebook con el token de la configuración de Login para empresas. */
export class FacebookClient {
  authorizationUrl(state: string) {
    const c = fbConfig();
    const q = new URLSearchParams({
      client_id: c.appId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      override_default_response_type: 'true',
      config_id: c.configId,
      state,
    });
    return `https://www.facebook.com/${API_VERSION}/dialog/oauth?${q.toString()}`;
  }

  /** Código → token → página autorizada (permisos granulares del token). */
  async connect(
    code: string,
  ): Promise<{ accessToken: string; pageId: string; pageName: string | null }> {
    const c = fbConfig();
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
    let pageId =
      scopes.find((s) => s.scope === 'pages_manage_posts')?.target_ids?.[0] ??
      scopes.find((s) => s.scope === 'pages_show_list')?.target_ids?.[0];
    let pageToken = accessToken;
    let pageName: string | null = null;
    if (!pageId) {
      // Respaldo: con Login para empresas la página puede no venir en granular_scopes.
      const accounts = await fetch(
        `${GRAPH}/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token', access_token: accessToken })}`,
        { signal: AbortSignal.timeout(10_000) },
      )
        .then((r) => r.json() as Promise<Json>)
        .catch(() => ({}) as Json);
      const first = (accounts.data as Json[] | undefined)?.[0];
      if (first?.id) {
        pageId = String(first.id);
        pageName = first.name ? String(first.name) : null;
        if (first.access_token) pageToken = String(first.access_token);
      }
    }
    if (!pageId)
      throw new BadGatewayException(
        `No se autorizó ninguna página de Facebook (permisos recibidos: ${scopes.map((s) => `${s.scope}:${s.target_ids?.length ?? 0}`).join(', ') || 'ninguno'}).`,
      );
    if (!pageName) {
      const page = await fetch(
        `${GRAPH}/${pageId}?${new URLSearchParams({ fields: 'name', access_token: pageToken })}`,
        { signal: AbortSignal.timeout(10_000) },
      )
        .then((r) => r.json() as Promise<Json>)
        .catch(() => ({}) as Json);
      pageName = page.name ? String(page.name) : null;
    }
    return { accessToken: pageToken, pageId: String(pageId), pageName };
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
        signal: AbortSignal.timeout(30_000),
      }),
      what,
    );
  }

  /** Publica texto, imagen o video en la página. */
  async publish(
    pageId: string,
    token: string,
    media: { kind: 'image' | 'video' | 'text'; url?: string; message: string },
  ): Promise<{ postId: string }> {
    let r: Json;
    if (media.kind === 'image' && media.url)
      r = await this.post(
        `${pageId}/photos`,
        token,
        { url: media.url, caption: media.message },
        'publicar la foto',
      );
    else if (media.kind === 'video' && media.url)
      r = await this.post(
        `${pageId}/videos`,
        token,
        { file_url: media.url, description: media.message },
        'publicar el video',
      );
    else
      r = await this.post(
        `${pageId}/feed`,
        token,
        { message: media.message },
        'publicar',
      );
    return { postId: String(r.post_id ?? r.id) };
  }
}
