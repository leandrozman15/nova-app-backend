import { createHmac, timingSafeEqual } from 'node:crypto';

/** El QR cambia cada 30 s: una captura de pantalla deja de servir enseguida. */
export const STEP_SECONDS = 30;
const STEP_MS = STEP_SECONDS * 1000;
/** Ventanas aceptadas hacia atrás (un QR recién cambiado) y hacia adelante (reloj del celular adelantado). */
const BACK = 1;
const FORWARD = 1;

export const accessKey = () =>
  process.env.ACCESS_QR_KEY ||
  process.env.PAYMENT_TOKENS_KEY ||
  process.env.CRON_SECRET ||
  '';

const sign = (key: string, playerId: string, window: number) =>
  createHmac('sha256', key)
    .update(`access:${playerId}:${window}`)
    .digest('hex')
    .slice(0, 24);

/** FX1.<atleta>.<ventana>.<firma>: no lleva datos personales, solo el id del legajo. */
export function signAccessToken(
  playerId: string,
  key = accessKey(),
  now = Date.now(),
) {
  const window = Math.floor(now / STEP_MS);
  return `FX1.${playerId}.${window}.${sign(key, playerId, window)}`;
}

export type TokenCheck =
  | { ok: true; playerId: string }
  | { ok: false; reason: 'format' | 'signature' | 'expired' };

export function verifyAccessToken(
  token: string,
  key = accessKey(),
  now = Date.now(),
): TokenCheck {
  const parts = String(token ?? '')
    .trim()
    .split('.');
  if (parts.length !== 4 || parts[0] !== 'FX1' || !key)
    return { ok: false, reason: 'format' };
  const [, playerId, win, sig] = parts;
  const window = Number(win);
  if (!playerId || !Number.isInteger(window))
    return { ok: false, reason: 'format' };
  const expected = Buffer.from(sign(key, playerId, window));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return { ok: false, reason: 'signature' };
  const current = Math.floor(now / STEP_MS);
  if (window < current - BACK || window > current + FORWARD)
    return { ok: false, reason: 'expired' };
  return { ok: true, playerId };
}
