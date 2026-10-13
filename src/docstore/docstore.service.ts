import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DocStoreMigrationService } from './docstore-migration.service';
import {
  type Filter,
  type Order,
  type PathInfo,
  type Row,
  type Viewer,
  applyUpdate,
  autoId,
  canRead,
  canWrite,
  deepMerge,
  inClub,
  isRosterPath,
  isStaff,
  parsePath,
  runQuery,
} from './docstore.rules';

const MAX_ROWS = 5000;
type Doc = Record<string, unknown>;

function asDoc(value: unknown): Doc {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Los datos tienen que ser un objeto');
  return value as Doc;
}

/** Almacén de documentos por ruta: reemplaza a Firestore en la consola. */
@Injectable()
export class DocStoreService {
  private readonly clubCompany = new Map<string, string | null>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: DocStoreMigrationService,
  ) {}

  private info(path: string): PathInfo {
    const info = parsePath(path);
    if (!info) throw new BadRequestException(`Ruta inválida: ${path}`);
    if (isRosterPath(info))
      throw new BadRequestException(
        'Esa información ahora se consulta en el padrón del club',
      );
    return info;
  }

  /** El club tiene que ser de la empresa del pedido. */
  private async checkClub(viewer: Viewer, clubId: string) {
    if (!this.clubCompany.has(clubId)) {
      const club = await this.prisma.club.findUnique({
        where: { id: clubId },
        select: { companyId: true },
      });
      this.clubCompany.set(clubId, club?.companyId ?? null);
    }
    if (this.clubCompany.get(clubId) !== viewer.companyId)
      throw new ForbiddenException('Club fuera de tu institución');
    await this.migration.ensureStage2(clubId);
  }

  private async assertRead(viewer: Viewer, info: PathInfo, data?: Doc) {
    if (info.kind === 'club') {
      await this.checkClub(viewer, info.clubId);
      if (!canRead(viewer, info.clubId, info.top))
        throw new ForbiddenException('Sin permiso para ver esto');
      return;
    }
    if (info.kind === 'club-field') {
      if (viewer.clubId) await this.migration.ensureStage2(viewer.clubId);
      if (!data) return; // las listas se filtran por club al responder
      const clubId = typeof data.clubId === 'string' ? data.clubId : null;
      if (info.collection === 'users') {
        const own = info.segments[1] === viewer.uid;
        if (own) return;
        if (!clubId || !inClub(viewer, clubId) || !isStaff(viewer))
          throw new ForbiddenException('Sin permiso para ver esto');
        return;
      }
      if (!clubId || !inClub(viewer, clubId))
        throw new ForbiddenException('Sin permiso para ver esto');
      return;
    }
  }

  private async assertWrite(
    viewer: Viewer,
    info: PathInfo,
    data: Doc,
    existing?: Doc | null,
  ) {
    if (info.kind === 'club') {
      await this.checkClub(viewer, info.clubId);
      if (!canWrite(viewer, info.clubId))
        throw new ForbiddenException('Sin permiso para modificar esto');
      return;
    }
    if (info.kind === 'club-field') {
      const clubId =
        (typeof data.clubId === 'string' && data.clubId) ||
        (existing && typeof existing.clubId === 'string'
          ? existing.clubId
          : null);
      if (!clubId) throw new BadRequestException('Falta el club del documento');
      if (
        existing &&
        typeof existing.clubId === 'string' &&
        existing.clubId !== clubId &&
        !inClub(viewer, existing.clubId)
      )
        throw new ForbiddenException('Sin permiso para modificar esto');
      await this.checkClub(viewer, clubId);
      if (!canWrite(viewer, clubId))
        throw new ForbiddenException('Sin permiso para modificar esto');
      return;
    }
    if (!isStaff(viewer))
      throw new ForbiddenException('Sin permiso para modificar esto');
  }

  private clubIdFor(info: PathInfo, data: Doc, viewer: Viewer) {
    if (info.kind === 'club') return info.clubId;
    if (typeof data.clubId === 'string') return data.clubId;
    return info.kind === 'company' ? viewer.clubId : null;
  }

  private toRow(row: {
    docId: string;
    path: string;
    data: Prisma.JsonValue;
  }): Row {
    return { id: row.docId, path: row.path, data: (row.data as Doc) ?? {} };
  }

  // ─── Lecturas ──────────────────────────────────────────────────────────────

  async get(viewer: Viewer, path: string) {
    const info = this.info(path);
    if (!info.isDoc)
      throw new BadRequestException('La ruta no es de un documento');
    if (info.kind !== 'club-field') await this.assertRead(viewer, info);
    else if (viewer.clubId) await this.migration.ensureStage2(viewer.clubId);
    const row = await this.prisma.storeDocument.findUnique({ where: { path } });
    if (info.kind === 'club' && info.segments.length === 2) {
      // La ficha del club: lo guardado más los datos del padrón de clubes (siempre presentes).
      const club = await this.prisma.club.findUnique({
        where: { id: info.clubId },
        select: {
          id: true,
          name: true,
          city: true,
          address: true,
          logoUrl: true,
          sport: true,
          companyId: true,
          timezone: true,
        },
      });
      if (!club && !row) return null;
      const known = Object.fromEntries(
        Object.entries(club ?? {}).filter(([, value]) => value !== null),
      );
      return {
        id: info.clubId,
        path,
        data: { ...((row?.data as Doc) ?? {}), ...known },
      };
    }
    if (!row) return null;
    const out = this.toRow(row);
    if (info.kind === 'club-field')
      await this.assertRead(viewer, info, out.data);
    if (
      info.kind === 'company' &&
      row.companyId &&
      row.companyId !== viewer.companyId
    )
      return null;
    return out;
  }

  async query(
    viewer: Viewer,
    input: {
      path?: string;
      group?: string;
      where?: Filter[];
      orderBy?: Order[];
      limit?: number;
    },
  ) {
    const filters = input.where ?? [];
    const orders = input.orderBy ?? [];
    let rows: Row[];

    if (input.path === 'clubs') {
      // Lista de clubes de la institución (vienen del padrón de clubes, con lo que tenía su ficha).
      const clubs = await this.prisma.club.findMany({
        where: {
          companyId: viewer.companyId,
          ...(isStaff(viewer) &&
          viewer.clubId &&
          ![
            'admin',
            'fed_admin',
            'league_admin',
            'municipal_admin',
            'municipal_secretary',
            'municipal_inspector',
          ].includes((viewer.role ?? '').toLowerCase())
            ? { id: viewer.clubId }
            : {}),
        },
        select: {
          id: true,
          name: true,
          city: true,
          address: true,
          logoUrl: true,
          sport: true,
          companyId: true,
        },
        take: MAX_ROWS,
      });
      const docs = await this.prisma.storeDocument.findMany({
        where: { path: { in: clubs.map((club) => `clubs/${club.id}`) } },
      });
      const byPath = new Map(
        docs.map((row) => [row.path, (row.data as Doc) ?? {}]),
      );
      const rows: Row[] = clubs.map((club) => ({
        id: club.id,
        path: `clubs/${club.id}`,
        data: {
          ...byPath.get(`clubs/${club.id}`),
          ...Object.fromEntries(
            Object.entries(club).filter(([, value]) => value !== null),
          ),
        },
      }));
      return runQuery(rows, filters, orders, input.limit);
    }

    if (input.group) {
      // Consulta de grupo (collectionGroup) dentro de un club.
      const byFilter = filters.find(
        (filter) => filter.field === 'clubId' && filter.op === '==',
      );
      const clubId =
        typeof byFilter?.value === 'string' ? byFilter.value : viewer.clubId;
      if (!clubId)
        throw new BadRequestException('Falta el club de la consulta');
      await this.checkClub(viewer, clubId);
      if (!canRead(viewer, clubId, input.group))
        throw new ForbiddenException('Sin permiso para ver esto');
      const found = await this.prisma.storeDocument.findMany({
        where: { clubId, collection: input.group },
        take: MAX_ROWS,
      });
      rows = found.map((row) => this.toRow(row));
    } else {
      const path = input.path ?? '';
      const info = this.info(path);
      if (info.isDoc)
        throw new BadRequestException('La ruta no es de una colección');
      const found = await (async () => {
        if (info.kind === 'club') {
          await this.assertRead(viewer, info);
          return this.prisma.storeDocument.findMany({
            where: { parentPath: path },
            take: MAX_ROWS,
          });
        }
        if (info.kind === 'club-field') {
          if (viewer.clubId) await this.migration.ensureStage2(viewer.clubId);
          const companyWide = !viewer.clubId;
          const all = await this.prisma.storeDocument.findMany({
            where: {
              parentPath: path,
              ...(companyWide ? { companyId: viewer.companyId } : {}),
            },
            take: MAX_ROWS,
          });
          // Solo lo del club del usuario (y, en staff, el padrón de usuarios del club).
          return all.filter((row) => {
            const data = (row.data as Doc) ?? {};
            const clubId = typeof data.clubId === 'string' ? data.clubId : null;
            if (info.collection === 'users')
              return (
                row.docId === viewer.uid ||
                (clubId !== null && inClub(viewer, clubId) && isStaff(viewer))
              );
            return clubId !== null && inClub(viewer, clubId);
          });
        }
        return this.prisma.storeDocument.findMany({
          where: {
            parentPath: path,
            OR: [{ companyId: viewer.companyId }, { companyId: null }],
          },
          take: MAX_ROWS,
        });
      })();
      rows = found.map((row) => this.toRow(row));
    }

    return runQuery(rows, filters, orders, input.limit);
  }

  // ─── Escrituras ────────────────────────────────────────────────────────────

  async set(viewer: Viewer, path: string, data: unknown, merge = false) {
    const info = this.info(path);
    if (!info.isDoc)
      throw new BadRequestException('La ruta no es de un documento');
    const incoming = asDoc(data);
    const existing = await this.prisma.storeDocument.findUnique({
      where: { path },
    });
    const previous = (existing?.data as Doc | undefined) ?? null;
    await this.assertWrite(viewer, info, incoming, previous);
    const next = merge && previous ? deepMerge(previous, incoming) : incoming;
    return this.save(viewer, info, path, next);
  }

  async update(viewer: Viewer, path: string, data: unknown) {
    const info = this.info(path);
    if (!info.isDoc)
      throw new BadRequestException('La ruta no es de un documento');
    const patch = asDoc(data);
    const existing = await this.prisma.storeDocument.findUnique({
      where: { path },
    });
    if (!existing)
      throw new NotFoundException(`No existe el documento ${path}`);
    const previous = (existing.data as Doc) ?? {};
    await this.assertWrite(viewer, info, { ...previous, ...patch }, previous);
    return this.save(viewer, info, path, applyUpdate(previous, patch));
  }

  async add(viewer: Viewer, collectionPath: string, data: unknown) {
    const info = this.info(collectionPath);
    if (info.isDoc)
      throw new BadRequestException('La ruta no es de una colección');
    const id = autoId();
    await this.set(viewer, `${collectionPath}/${id}`, data, false);
    return { id, path: `${collectionPath}/${id}` };
  }

  async remove(viewer: Viewer, path: string) {
    const info = this.info(path);
    if (!info.isDoc)
      throw new BadRequestException('La ruta no es de un documento');
    const existing = await this.prisma.storeDocument.findUnique({
      where: { path },
    });
    if (!existing) return { ok: true };
    await this.assertWrite(
      viewer,
      info,
      (existing.data as Doc) ?? {},
      (existing.data as Doc) ?? {},
    );
    await this.prisma.storeDocument.delete({ where: { path } });
    return { ok: true };
  }

  private async save(viewer: Viewer, info: PathInfo, path: string, data: Doc) {
    const segments = path.split('/');
    const parentPath = segments.slice(0, -1).join('/');
    const fields = {
      parentPath,
      collection: segments.at(-2)!,
      docId: segments.at(-1)!,
      clubId: this.clubIdFor(info, data, viewer),
      companyId: viewer.companyId,
      data: data as Prisma.InputJsonValue,
    };
    const row = await this.prisma.storeDocument.upsert({
      where: { path },
      create: { path, ...fields },
      update: fields,
    });
    return this.toRow(row);
  }
}
