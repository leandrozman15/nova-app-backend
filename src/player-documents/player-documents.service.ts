import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { getApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

import { DocStoreService } from '../docstore/docstore.service';
import { inClub, isDirection } from '../docstore/docstore.rules';
import type { Viewer } from '../docstore/docstore.rules';
import { PrismaService } from '../prisma/prisma.service';
import { UploadDocumentDto } from './player-documents.dto';

const DEFAULT_BUCKET = 'studio-9112699346-ecb8d.firebasestorage.app';
/** Los enlaces de lectura duran 5 minutos: no sirven para compartir. */
export const SIGNED_URL_MINUTES = 5;
/** El cuerpo del pedido admite 4 MB en base64 (~3 MB de archivo). */
export const MAX_FILE_BYTES = 2.8 * 1024 * 1024;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const LABEL: Record<string, string> = {
  dni_front: 'DNI frente',
  dni_back: 'DNI dorso',
  medical: 'Certificado médico',
  other: 'Otro documento',
};

type Meta = {
  id: string;
  slot: string;
  title?: string;
  storagePath: string;
  contentType: string;
  fileName: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  expiresAt?: string | null;
};

/**
 * Documentación de los atletas (DNI, certificado médico). Los archivos se suben y se leen
 * siempre a través del servidor: sin enlaces permanentes y solo para la dirección del club.
 * Cada vista, descarga, alta y baja queda registrada en document_access_log.
 */
@Injectable()
export class PlayerDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: DocStoreService,
    private readonly config: ConfigService,
  ) {}

  private bucket() {
    const name =
      this.config.get<string>('FIREBASE_STORAGE_BUCKET') || DEFAULT_BUCKET;
    return getStorage(getApp()).bucket(name);
  }

  private async assertAccess(viewer: Viewer, clubId: string, playerId: string) {
    if (!isDirection(viewer) || !inClub(viewer, clubId))
      throw new ForbiddenException(
        'Solo la dirección del club puede ver o cargar documentación',
      );
    const player = await this.prisma.player.findFirst({
      where: { id: playerId, clubId, companyId: viewer.companyId },
      select: { id: true },
    });
    if (!player) throw new NotFoundException('Atleta inexistente');
  }

  private docPath(clubId: string, playerId: string, docId: string) {
    return `clubs/${clubId}/players/${playerId}/documents/${docId}`;
  }

  private async log(
    viewer: Viewer,
    email: string | undefined,
    clubId: string,
    playerId: string,
    docId: string,
    action: 'view' | 'download' | 'upload' | 'replace' | 'delete',
    label: string,
  ) {
    await this.store.set(
      viewer,
      `clubs/${clubId}/document_access_log/${randomUUID()}`,
      {
        clubId,
        playerId,
        docId,
        label,
        action,
        byUid: viewer.uid,
        byRole: viewer.role,
        byEmail: email ?? null,
        at: new Date().toISOString(),
      },
      false,
    );
  }

  async upload(
    viewer: Viewer,
    email: string | undefined,
    playerId: string,
    dto: UploadDocumentDto,
  ) {
    await this.assertAccess(viewer, dto.clubId, playerId);
    const buffer = Buffer.from(dto.dataBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES)
      throw new BadRequestException(
        `El archivo debe pesar hasta ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MB`,
      );
    const isPdf = buffer.subarray(0, 4).toString() === '%PDF';
    if ((dto.contentType === 'application/pdf') !== isPdf)
      throw new BadRequestException('El contenido no coincide con el tipo');

    // Consentimiento: se exige una vez por atleta antes del primer documento.
    const consentPath = this.docPath(dto.clubId, playerId, 'consent');
    const consentExisting = await this.store
      .get(viewer, consentPath)
      .catch(() => null);
    const hasConsent = !!(
      consentExisting &&
      (consentExisting as { exists?: boolean }).exists !== false &&
      (consentExisting as { data?: unknown }).data
    );
    if (!hasConsent) {
      if (!dto.consent)
        throw new BadRequestException(
          'Falta el consentimiento para tratar estos datos',
        );
      await this.store.set(
        viewer,
        consentPath,
        {
          slot: 'consent',
          acceptedAt: new Date().toISOString(),
          acceptedBy: dto.consent.acceptedBy,
          relationship: dto.consent.relationship,
          textVersion: dto.consent.textVersion,
          registeredByUid: viewer.uid,
          registeredByEmail: email ?? null,
        },
        false,
      );
    }

    const path = `private/clubs/${dto.clubId}/players/${playerId}/documents/${dto.docId}-${Date.now()}.${EXT[dto.contentType]}`;
    const bucket = this.bucket();
    await bucket.file(path).save(buffer, {
      resumable: false,
      contentType: dto.contentType,
      metadata: { cacheControl: 'private, max-age=0, no-store' },
    });

    const docPath = this.docPath(dto.clubId, playerId, dto.docId);
    const previous = (await this.store
      .get(viewer, docPath)
      .catch(() => null)) as { data?: Meta } | null;
    const prevMeta = previous?.data;
    const meta: Meta = {
      id: dto.docId,
      slot: dto.slot,
      ...(dto.slot === 'other' && dto.title ? { title: dto.title } : {}),
      storagePath: path,
      contentType: dto.contentType,
      fileName: dto.fileName,
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: viewer.uid,
      expiresAt:
        dto.slot === 'medical'
          ? (dto.expiresAt ?? prevMeta?.expiresAt ?? null)
          : null,
    };
    await this.store.set(viewer, docPath, meta, false);
    if (prevMeta?.storagePath)
      await bucket
        .file(prevMeta.storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);
    await this.log(
      viewer,
      email,
      dto.clubId,
      playerId,
      dto.docId,
      prevMeta ? 'replace' : 'upload',
      dto.title || LABEL[dto.slot],
    );
    return meta;
  }

  async signedUrl(
    viewer: Viewer,
    email: string | undefined,
    clubId: string,
    playerId: string,
    docId: string,
    mode: 'view' | 'download',
    downloadName?: string,
  ) {
    await this.assertAccess(viewer, clubId, playerId);
    const result = (await this.store.get(
      viewer,
      this.docPath(clubId, playerId, docId),
    )) as { data?: Meta } | null;
    const meta = result?.data;
    if (!meta?.storagePath)
      throw new NotFoundException('Documento inexistente');
    const safeName = (downloadName || meta.fileName || 'documento')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .slice(0, 120);
    const [url] = await this.bucket()
      .file(meta.storagePath)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + SIGNED_URL_MINUTES * 60_000,
        responseDisposition:
          mode === 'download' ? `attachment; filename="${safeName}"` : 'inline',
      });
    await this.log(
      viewer,
      email,
      clubId,
      playerId,
      docId,
      mode,
      meta.title || LABEL[meta.slot] || 'Documento',
    );
    return { url, expiresInSeconds: SIGNED_URL_MINUTES * 60 };
  }

  async remove(
    viewer: Viewer,
    email: string | undefined,
    clubId: string,
    playerId: string,
    docId: string,
  ) {
    await this.assertAccess(viewer, clubId, playerId);
    const path = this.docPath(clubId, playerId, docId);
    const result = (await this.store.get(viewer, path).catch(() => null)) as {
      data?: Meta;
    } | null;
    const meta = result?.data;
    if (meta?.storagePath)
      await this.bucket()
        .file(meta.storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);
    await this.store.remove(viewer, path);
    await this.log(
      viewer,
      email,
      clubId,
      playerId,
      docId,
      'delete',
      meta?.title || LABEL[meta?.slot ?? 'other'] || 'Documento',
    );
    return { ok: true };
  }
}
