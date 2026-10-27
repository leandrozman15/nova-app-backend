import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

/**
 * Cifrado de datos personales (jugadores, socios, lesiones) con AES-256-GCM.
 *
 * PII_ENCRYPTION_KEY: 32 bytes en base64 (`openssl rand -base64 32`).
 * Valor guardado: `enc1:<iv>.<tag>.<texto cifrado>` (base64url). Lo que no
 * empieza con `enc1:` es un dato viejo en claro y se devuelve tal cual, así se
 * puede migrar de a poco sin cortar el servicio.
 *
 * Para buscar por DNI sin guardarlo en claro se usa un índice ciego: HMAC-SHA256
 * con una clave derivada (distinta de la de cifrado).
 */
export const PII_PREFIX = 'enc1:';

function masterKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_ENCRYPTION_KEY no está configurada');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length !== 32)
    throw new Error('PII_ENCRYPTION_KEY debe tener 32 bytes en base64');
  return buffer;
}

function derived(label: string): Buffer {
  return createHmac('sha256', masterKey()).update(label).digest();
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PII_PREFIX);
}

export function encryptPii(plain: string): string {
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derived('pii-encrypt'), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PII_PREFIX}${[iv, cipher.getAuthTag(), data]
    .map((part) => part.toString('base64url'))
    .join('.')}`;
}

export function decryptPii(value: string): string {
  if (!isEncrypted(value)) return value;
  const [iv, tag, data] = value.slice(PII_PREFIX.length).split('.');
  if (!iv || !tag || !data)
    throw new Error('Dato cifrado con formato desconocido');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    derived('pii-encrypt'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Índice ciego del DNI (solo dígitos): igual DNI → igual hash, sin revelar el DNI. */
export function dniHash(dni: string | null | undefined): string | null {
  const digits = (dni ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return createHmac('sha256', derived('pii-dni-index'))
    .update(digits)
    .digest('base64url');
}

export const encryptOptional = (value: string | null | undefined) =>
  value === null || value === undefined || value === ''
    ? (value ?? null)
    : encryptPii(value);

export const decryptOptional = (value: string | null | undefined) =>
  value === null || value === undefined ? value : decryptPii(value);

/** JSON completo (familyMembers) → { __enc: '...' }. */
export function encryptJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (
    typeof value === 'object' &&
    '__enc' in (value as Record<string, unknown>)
  )
    return value;
  return { __enc: encryptPii(JSON.stringify(value)) };
}

export function decryptJson(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const enc = (value as Record<string, unknown>).__enc;
    if (typeof enc === 'string') return JSON.parse(decryptPii(enc));
  }
  return value;
}

/**
 * `extra` mezcla datos operativos (equipo, división, email del tutor para el
 * portal de padres) con datos personales del tutor, obra social, etc. Se cifra
 * el valor de cada clave salvo las operativas, que las consultas necesitan en claro.
 */
export const EXTRA_PLAIN_KEYS = new Set([
  'teamId',
  'teamName',
  'divisionId',
  'divisionName',
  'guardianEmail',
  'importBatch',
  'importedBy',
]);

export function encryptExtra(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      EXTRA_PLAIN_KEYS.has(key) || item === null || item === undefined
        ? item
        : isEncrypted(item)
          ? item
          : encryptPii(JSON.stringify(item)),
    ]),
  );
}

export function decryptExtra(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      isEncrypted(item) ? (JSON.parse(decryptPii(item)) as unknown) : item,
    ]),
  );
}
