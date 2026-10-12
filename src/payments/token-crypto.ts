import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cifrado de los tokens de Mercado Pago de cada club (AES-256-GCM).
 * PAYMENT_TOKENS_KEY: 32 bytes en base64 (`openssl rand -base64 32`).
 * Formato guardado: v1.<iv>.<tag>.<texto cifrado>, todo en base64url.
 */
function key(): Buffer {
  const raw = process.env.PAYMENT_TOKENS_KEY;
  if (!raw) throw new Error('PAYMENT_TOKENS_KEY no está configurada');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length !== 32)
    throw new Error('PAYMENT_TOKENS_KEY debe tener 32 bytes en base64');
  return buffer;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data)
    throw new Error('Secreto cifrado con formato desconocido');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Firma HMAC (para el `state` del OAuth). Clave derivada para no reutilizar la de cifrado. */
function signingKey(): Buffer {
  return createHmac('sha256', key()).update('oauth-state').digest();
}

export function signState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', signingKey())
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function verifyState<T>(state: string): T | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', signingKey()).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
