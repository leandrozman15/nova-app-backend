/** Reglas puras de las notificaciones push (sin base de datos ni Firebase). */

export const FCM_BATCH = 500;

/** Errores de FCM que significan que el token ya no sirve y hay que borrarlo. */
export const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export function chunk<T>(items: T[], size = FCM_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const normEmail = (e?: string | null) => (e ?? '').trim().toLowerCase();

/**
 * Tokens que reciben un aviso del club: dispositivos de los usuarios del club (por uid)
 * y de madres/padres (por email verificado de tutor). Sin repetidos, sin el que envía.
 */
export function audienceTokens(
  devices: Array<{ token: string; firebaseUid: string; email: string | null }>,
  uids: Set<string>,
  guardianEmails: Set<string>,
  senderUid?: string,
): string[] {
  const tokens = new Set<string>();
  for (const d of devices) {
    if (senderUid && d.firebaseUid === senderUid) continue;
    if (uids.has(d.firebaseUid) || (d.email && guardianEmails.has(normEmail(d.email)))) tokens.add(d.token);
  }
  return [...tokens];
}
