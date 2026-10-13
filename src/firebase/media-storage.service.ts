import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { getApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

/** Bucket de Firebase Storage de la app web. */
const DEFAULT_BUCKET = 'studio-9112699346-ecb8d.firebasestorage.app';

const DATA_URL =
  /^data:(image\/(png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/;
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 4;

export function isDataImage(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

/**
 * Las fotos llegan desde la app como texto base64 (data:image/...). Este
 * servicio las sube a Firebase Storage y devuelve el enlace público, para que
 * en la base solo quede la URL. Si la subida falla, se deja el valor como
 * vino: guardar nunca se rompe por una foto.
 */
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);

  constructor(private readonly config: ConfigService) {}

  private get bucketName() {
    return this.config.get<string>('FIREBASE_STORAGE_BUCKET') || DEFAULT_BUCKET;
  }

  /** Sube una imagen base64 y devuelve su URL de descarga. */
  async upload(dataUrl: string, folder: string): Promise<string> {
    const match = DATA_URL.exec(dataUrl);
    if (!match) throw new Error('No es una imagen base64 válida');
    const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const buffer = Buffer.from(match[3], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES)
      throw new Error(`Tamaño de imagen inválido (${buffer.length} bytes)`);

    const safeFolder = folder
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .map((part) => part.replace(/[^A-Za-z0-9_-]/g, '_'))
      .join('/');
    const name = `media/${safeFolder}/${randomUUID()}.${EXT[contentType]}`;
    const token = randomUUID();
    const bucket = getStorage(getApp()).bucket(this.bucketName);
    await bucket.file(name).save(buffer, {
      resumable: false,
      contentType,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    return (
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(name)}?alt=media&token=${token}`
    );
  }

  /** Igual que upload, pero si falla devuelve el valor original. */
  async externalize(value: string, folder: string): Promise<string> {
    try {
      return await this.upload(value, folder);
    } catch (error) {
      this.logger.warn(
        `No se pudo subir una imagen a Storage: ${String(error)}`,
      );
      return value;
    }
  }

  /**
   * Recorre un objeto (o lista) y reemplaza toda imagen base64 por su URL.
   * Modifica y devuelve el mismo objeto. `changed` cuenta cuántas subió.
   */
  async externalizeDeep<T>(
    value: T,
    folder: string,
    stats: { changed: number } = { changed: 0 },
    depth = 0,
  ): Promise<T> {
    if (depth > MAX_DEPTH || value === null || typeof value !== 'object')
      return value;
    const entries: Array<[string | number, unknown]> = Array.isArray(value)
      ? value.map((item, index) => [index, item] as [number, unknown])
      : Object.entries(value as Record<string, unknown>);
    for (const [key, item] of entries) {
      if (isDataImage(item)) {
        const url = await this.externalize(item, folder);
        if (url !== item) {
          (value as Record<string | number, unknown>)[key] = url;
          stats.changed += 1;
        }
      } else if (item && typeof item === 'object') {
        await this.externalizeDeep(item, folder, stats, depth + 1);
      }
    }
    return value;
  }

  /** true si hay alguna imagen base64 adentro (para no recorrer de más). */
  hasDataImage(value: unknown, depth = 0): boolean {
    if (isDataImage(value)) return true;
    if (depth > MAX_DEPTH || !value || typeof value !== 'object') return false;
    return Object.values(value as Record<string, unknown>).some((item) =>
      this.hasDataImage(item, depth + 1),
    );
  }
}
