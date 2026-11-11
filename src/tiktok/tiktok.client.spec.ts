import { TiktokClient, isTiktokConfigured } from './tiktok.client';

describe('TiktokClient', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('arma la URL de autorización con los permisos de publicar', () => {
    process.env.TIKTOK_CLIENT_KEY = 'ck';
    const url = new URL(new TiktokClient().authorizationUrl('st'));
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('client_key')).toBe('ck');
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.publish');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('redirect_uri')).toContain('/tiktok/oauth/callback');
  });

  it('requiere clave, secreto y clave de cifrado', () => {
    delete process.env.TIKTOK_CLIENT_KEY;
    expect(isTiktokConfigured()).toBe(false);
    process.env.TIKTOK_CLIENT_KEY = 'a';
    process.env.TIKTOK_CLIENT_SECRET = 'b';
    process.env.PAYMENT_TOKENS_KEY = 'c';
    expect(isTiktokConfigured()).toBe(true);
  });
});
