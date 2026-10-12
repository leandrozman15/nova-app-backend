import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Hosts desde los que aceptamos imágenes públicas (Firebase Storage). Evita que
 * la vidriera muestre imágenes de terceros (rastreo, contenido no controlado).
 * Se puede ampliar con PUBLIC_MEDIA_HOSTS="cdn.ejemplo.com,otro.com".
 */
const DEFAULT_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
];
const DEFAULT_HOST_SUFFIXES = ['.firebasestorage.app'];

export function isPublicMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;

  const extra = (process.env.PUBLIC_MEDIA_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const host = url.hostname.toLowerCase();
  return (
    [...DEFAULT_HOSTS, ...extra].includes(host) ||
    DEFAULT_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

export function IsPublicMediaUrl(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isPublicMediaUrl',
      target: target.constructor,
      propertyName,
      options: {
        message: 'La imagen debe estar alojada en el Storage del club',
        ...options,
      },
      validator: { validate: (value: unknown) => isPublicMediaUrl(value) },
    });
}
