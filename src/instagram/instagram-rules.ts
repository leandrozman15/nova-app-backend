import { isPublicMediaUrl } from '../common/validation/public-media-url';

export const CAPTION_MAX = 2200;

/** Instagram acepta hasta 2200 caracteres y 30 hashtags en el texto. */
export function buildCaption(title: string, body: string): string {
  const text = [title.trim(), body.trim()].filter(Boolean).join('\n\n');
  return text.length > CAPTION_MAX
    ? `${text.slice(0, CAPTION_MAX - 1)}…`
    : text;
}

export function validateMediaUrl(url: string): void {
  if (!isPublicMediaUrl(url))
    throw new Error(
      'El archivo tiene que estar en el almacenamiento de la app',
    );
}
