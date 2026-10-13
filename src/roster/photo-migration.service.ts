import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  isDataImage,
  MediaStorageService,
} from '../firebase/media-storage.service';
import { PrismaService } from '../prisma/prisma.service';

export type PhotoMigrationReport = {
  players: number;
  members: number;
  clubs: number;
  documents: number;
  failed: number;
  remaining: number;
  errors: string[];
};

/** Tiempo máximo por llamada (el panel repite hasta que no quede nada). */
const BUDGET_MS = 45_000;
const BATCH = 25;

/**
 * Pasa las fotos guardadas como base64 (fichas, socios, logos y documentos)
 * a Firebase Storage y deja en la base solo el enlace.
 */
@Injectable()
export class PhotoMigrationService {
  private readonly logger = new Logger(PhotoMigrationService.name);
  private running: Promise<PhotoMigrationReport> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaStorageService,
  ) {}

  run(): Promise<PhotoMigrationReport> {
    if (this.running) return this.running;
    this.running = this.migrate().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async remaining() {
    const [row] = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT
        (SELECT count(*) FROM "Player" WHERE "photoUrl" LIKE 'data:image/%' OR extra::text LIKE '%"data:image/%') +
        (SELECT count(*) FROM "Member" WHERE "photoUrl" LIKE 'data:image/%') +
        (SELECT count(*) FROM "Club" WHERE "logoUrl" LIKE 'data:image/%') +
        (SELECT count(*) FROM "StoreDocument" WHERE data::text LIKE '%"data:image/%')
        AS total`;
    return Number(row?.total ?? 0);
  }

  private async migrate(): Promise<PhotoMigrationReport> {
    const started = Date.now();
    const report: PhotoMigrationReport = {
      players: 0,
      members: 0,
      clubs: 0,
      documents: 0,
      failed: 0,
      remaining: 0,
      errors: [],
    };
    const skip = new Set<string>();
    const inTime = () => Date.now() - started < BUDGET_MS;
    const fail = (what: string, error: unknown) => {
      report.failed += 1;
      if (report.errors.length < 20)
        report.errors.push(`${what}: ${String(error)}`);
    };
    const notIn = () =>
      skip.size
        ? Prisma.sql`AND id NOT IN (${Prisma.join([...skip])})`
        : Prisma.empty;

    // Fichas de jugadores (foto y lo que haya en extra).
    while (inTime()) {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          clubId: string;
          photoUrl: string | null;
          extra: unknown;
        }>
      >`SELECT id, "clubId", "photoUrl", extra FROM "Player"
        WHERE ("photoUrl" LIKE 'data:image/%' OR extra::text LIKE '%"data:image/%') ${notIn()}
        LIMIT ${BATCH}`;
      if (rows.length === 0) break;
      for (const row of rows) {
        skip.add(row.id);
        try {
          const folder = `clubs/${row.clubId}/players/${row.id}`;
          const stats = { changed: 0 };
          const data: Prisma.PlayerUpdateInput = {};
          if (isDataImage(row.photoUrl)) {
            data.photoUrl = await this.media.upload(row.photoUrl, folder);
            stats.changed += 1;
          }
          if (row.extra && this.media.hasDataImage(row.extra)) {
            const extra = await this.media.externalizeDeep(
              structuredClone(row.extra),
              folder,
              stats,
            );
            data.extra = extra;
          }
          if (stats.changed) {
            await this.prisma.player.update({ where: { id: row.id }, data });
            report.players += 1;
          }
        } catch (error) {
          fail(`Jugador ${row.id}`, error);
        }
      }
    }

    // Socios.
    while (inTime()) {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; clubId: string; photoUrl: string }>
      >`SELECT id, "clubId", "photoUrl" FROM "Member"
        WHERE "photoUrl" LIKE 'data:image/%' ${notIn()} LIMIT ${BATCH}`;
      if (rows.length === 0) break;
      for (const row of rows) {
        skip.add(row.id);
        try {
          const url = await this.media.upload(
            row.photoUrl,
            `clubs/${row.clubId}/members/${row.id}`,
          );
          await this.prisma.member.update({
            where: { id: row.id },
            data: { photoUrl: url },
          });
          report.members += 1;
        } catch (error) {
          fail(`Socio ${row.id}`, error);
        }
      }
    }

    // Logos de clubes.
    while (inTime()) {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; logoUrl: string }>
      >`
        SELECT id, "logoUrl" FROM "Club"
        WHERE "logoUrl" LIKE 'data:image/%' ${notIn()} LIMIT ${BATCH}`;
      if (rows.length === 0) break;
      for (const row of rows) {
        skip.add(row.id);
        try {
          const url = await this.media.upload(
            row.logoUrl,
            `clubs/${row.id}/logo`,
          );
          await this.prisma.club.update({
            where: { id: row.id },
            data: { logoUrl: url },
          });
          report.clubs += 1;
        } catch (error) {
          fail(`Club ${row.id}`, error);
        }
      }
    }

    // Documentos (técnicos, usuarios, rivales, eventos, tienda…).
    while (inTime()) {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; path: string; data: unknown }>
      >`SELECT id, path, data FROM "StoreDocument"
        WHERE data::text LIKE '%"data:image/%' ${notIn()} LIMIT ${BATCH}`;
      if (rows.length === 0) break;
      for (const row of rows) {
        skip.add(row.id);
        try {
          const stats = { changed: 0 };
          const folder = row.path.split('/').slice(0, -1).join('/');
          const data = await this.media.externalizeDeep(
            structuredClone(row.data),
            folder,
            stats,
          );
          if (stats.changed) {
            await this.prisma.storeDocument.update({
              where: { id: row.id },
              data: { data: data as Prisma.InputJsonValue },
            });
            report.documents += 1;
          }
          if (this.media.hasDataImage(data))
            fail(`Documento ${row.path}`, 'quedaron imágenes sin subir');
        } catch (error) {
          fail(`Documento ${row.path}`, error);
        }
      }
    }

    report.remaining = await this.remaining();
    this.logger.log(
      `Fotos a Storage: ${report.players} fichas, ${report.members} socios, ` +
        `${report.clubs} logos, ${report.documents} documentos, ${report.failed} con error, ` +
        `${report.remaining} pendientes`,
    );
    return report;
  }
}
