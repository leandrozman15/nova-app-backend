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

import { guardianEmailOf, isAdult } from '../common/guardian';
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
  /** parent (lo subió la familia) o el rol de la dirección que lo cargó. */
  uploadedByRole?: string;
  expiresAt?: string | null;
};

/** Quién hace la acción: queda en el registro de accesos y en el documento. */
type Actor = { uid: string; email?: string; role: string };

/** Lo que el servidor sabe de quien llama (viene del token verificado). */
export type GuardianAuth = {
  uid?: string;
  email?: string;
  emailVerified?: boolean;
};

const FIXED: { slot: string; label: string; hint: string }[] = [
  {
    slot: 'dni_front',
    label: 'DNI · Frente',
    hint: 'Foto o escaneo del frente',
  },
  { slot: 'dni_back', label: 'DNI · Dorso', hint: 'Foto o escaneo del dorso' },
  { slot: 'medical', label: 'Certificado médico', hint: 'Apto físico vigente' },
];

/** Vigencia del certificado: soon = vence en los próximos 30 días. */
export function expiryOf(
  expiresAt: string | null | undefined,
  now = new Date(),
) {
  if (!expiresAt) return 'none' as const;
  const end = new Date(`${expiresAt}T23:59:59`);
  if (Number.isNaN(end.getTime())) return 'none' as const;
  if (end.getTime() < now.getTime()) return 'expired' as const;
  return (end.getTime() - now.getTime()) / 86_400_000 <= 30
    ? ('soon' as const)
    : ('valid' as const);
}

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
    storeViewer: Viewer,
    actor: Actor,
    clubId: string,
    playerId: string,
    docId: string,
    action: 'view' | 'download' | 'upload' | 'replace' | 'delete',
    label: string,
  ) {
    await this.store.set(
      storeViewer,
      `clubs/${clubId}/document_access_log/${randomUUID()}`,
      {
        clubId,
        playerId,
        docId,
        label,
        action,
        byUid: actor.uid,
        byRole: actor.role,
        byEmail: actor.email ?? null,
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
    return this.persist(
      viewer,
      { uid: viewer.uid, email, role: viewer.role ?? 'admin' },
      playerId,
      dto,
    );
  }

  /** Guarda el archivo y su ficha. El acceso ya se verificó antes (dirección o tutor del atleta). */
  private async persist(
    viewer: Viewer,
    actor: Actor,
    playerId: string,
    dto: UploadDocumentDto,
  ) {
    const email = actor.email;
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
          registeredByUid: actor.uid,
          registeredByEmail: email ?? null,
          registeredByRole: actor.role,
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
      uploadedBy: actor.uid,
      uploadedByRole: actor.role,
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
      actor,
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
    return this.makeUrl(
      viewer,
      { uid: viewer.uid, email, role: viewer.role ?? 'admin' },
      clubId,
      playerId,
      docId,
      mode,
      downloadName,
    );
  }

  private async makeUrl(
    viewer: Viewer,
    actor: Actor,
    clubId: string,
    playerId: string,
    docId: string,
    mode: 'view' | 'download',
    downloadName?: string,
  ) {
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
      actor,
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
      { uid: viewer.uid, email, role: viewer.role ?? 'admin' },
      clubId,
      playerId,
      docId,
      'delete',
      meta?.title || LABEL[meta?.slot ?? 'other'] || 'Documento',
    );
    return { ok: true };
  }

  // ─── Familias: el padre/madre/tutor carga y ve la documentación de su hijo/a ──────────────
  // Los archivos y su ficha quedan en el mismo lugar que los de la dirección, así que aparecen
  // solos en la ficha del atleta. La familia puede cargar, reemplazar y ver, pero no borrar.

  private async assertGuardian(auth: GuardianAuth, playerId: string) {
    const email = auth.email?.trim().toLowerCase();
    if (!email || auth.emailVerified !== true)
      throw new ForbiddenException('Verificá tu email para ver a tu hijo/a');
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        clubId: true,
        companyId: true,
        extra: true,
        birthDate: true,
      },
    });
    if (!player || guardianEmailOf(player.extra) !== email)
      throw new ForbiddenException('Este atleta no está vinculado a tu cuenta');
    // El acceso a la tabla de documentos lo da la verificación de arriba, no el rol: por eso se usa
    // una identidad interna de dirección solo para leer y escribir en el club de este atleta.
    const viewer: Viewer = {
      uid: auth.uid ?? '',
      role: 'admin',
      clubId: player.clubId,
      companyId: player.companyId,
    };
    const actor: Actor = { uid: auth.uid ?? '', email, role: 'parent' };
    return { player, viewer, actor };
  }

  /** Lo que el club pide (DNI frente y dorso, certificado médico) con su estado, más otros adjuntos. */
  async guardianList(auth: GuardianAuth, playerId: string) {
    const { player, viewer } = await this.assertGuardian(auth, playerId);
    const rows = await this.store.query(viewer, {
      path: `clubs/${player.clubId}/players/${playerId}/documents`,
    });
    const docs = rows
      .filter((r) => (r.data as { slot?: string }).slot !== 'consent')
      .map((r) => ({ ...(r.data as Meta), id: r.id }));
    const present = (d: Meta & { id: string }) => ({
      id: d.id,
      slot: d.slot,
      title: d.title ?? null,
      fileName: d.fileName,
      contentType: d.contentType,
      size: d.size,
      uploadedAt: d.uploadedAt,
      uploadedByFamily: d.uploadedByRole === 'parent',
      expiresAt: d.expiresAt ?? null,
    });
    const requested = FIXED.map((f) => {
      const doc = docs.find((d) => d.id === f.slot || d.slot === f.slot);
      const expiry = f.slot === 'medical' ? expiryOf(doc?.expiresAt) : 'none';
      return {
        slot: f.slot,
        label: f.label,
        hint: f.hint,
        document: doc ? present(doc) : null,
        // missing: falta cargar · expired/soon: certificado vencido o por vencer · ok: cargado
        status: !doc
          ? 'missing'
          : expiry === 'expired'
            ? 'expired'
            : expiry === 'soon'
              ? 'soon'
              : 'ok',
      };
    });
    const others = docs.filter((d) => d.slot === 'other').map(present);
    const consent = rows.some(
      (r) => (r.data as { slot?: string }).slot === 'consent',
    );
    return {
      playerId,
      clubId: player.clubId,
      /** Mayor de edad: tiene que cargar sus documentos él/ella; la familia solo los ve. */
      canUpload: !isAdult(player.birthDate),
      hasConsent: consent,
      requested,
      others,
    };
  }

  async guardianUpload(
    auth: GuardianAuth,
    playerId: string,
    dto: UploadDocumentDto,
  ) {
    const { player, viewer, actor } = await this.assertGuardian(auth, playerId);
    if (isAdult(player.birthDate))
      throw new ForbiddenException(
        'El atleta es mayor de edad: tiene que cargar su documentación él/ella mismo/a',
      );
    if (dto.clubId !== player.clubId)
      throw new ForbiddenException('Este atleta no es de ese club');
    if (dto.consent && dto.consent.relationship === 'self')
      throw new BadRequestException(
        'El consentimiento lo da la madre, el padre o el tutor',
      );
    return this.persist(viewer, actor, playerId, dto);
  }

  async guardianUrl(
    auth: GuardianAuth,
    playerId: string,
    docId: string,
    mode: 'view' | 'download',
    name?: string,
  ) {
    const { player, viewer, actor } = await this.assertGuardian(auth, playerId);
    if (docId === 'consent')
      throw new NotFoundException('Documento inexistente');
    return this.makeUrl(
      viewer,
      actor,
      player.clubId,
      playerId,
      docId,
      mode,
      name,
    );
  }
}
