import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida el header x-signature de las notificaciones de Mercado Pago:
 * "ts=<timestamp>,v1=<hmac>" con HMAC-SHA256 del manifiesto
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" y la clave secreta de la app.
 * Igual siempre se consulta el pago en la API: la firma es una capa extra.
 */
export function isValidWebhookSignature(params: {
  signatureHeader?: string;
  requestId?: string;
  dataId?: string;
  secret: string;
  maxAgeSeconds?: number;
}): boolean {
  const {
    signatureHeader,
    requestId,
    dataId,
    secret,
    maxAgeSeconds = 600,
  } = params;
  if (!signatureHeader || !secret || !dataId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [k, ...rest] = part.trim().split('=');
      return [k, rest.join('=')];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const tsNumber = Number(ts);
  const tsSeconds = tsNumber > 1e12 ? tsNumber / 1000 : tsNumber;
  if (
    !Number.isFinite(tsSeconds) ||
    Math.abs(Date.now() / 1000 - tsSeconds) > maxAgeSeconds
  )
    return false;

  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac('sha256', secret).update(manifest).digest();
  let given: Buffer;
  try {
    given = Buffer.from(v1, 'hex');
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
