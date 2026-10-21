import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type Doc,
  disciplineData,
  divisionData,
  parseDay,
  plain,
  playerData,
  str,
} from './roster.mapper';

export type Stage1Report = {
  clubId: string;
  clubName: string;
  skipped?: string;
  disciplines: { created: number; updated: number };
  divisions: { created: number; updated: number };
  players: { created: number; merged: number; failed: number };
  errors: string[];
};

const MAX_ERRORS = 20;

/**
 * Etapa 1 de la salida de Firestore: copia disciplinas, ramas y fichas de
 * jugadores de cada club a Postgres. Se puede repetir: actualiza lo que ya
 * copió, y nunca borra nada en Firestore.
 */
@Injectable()
export class FirestoreMigrationService {
  private readonly logger = new Logger(FirestoreMigrationService.name);
  private readonly running = new Map<string, Promise<Stage1Report>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseAdminService,
  ) {}

  /** Copia el club la primera vez que se lo usa (sin bloquear si Firestore falla). */
  async ensureStage1(clubId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { firestoreMigration: true },
    });
    const done = (club?.firestoreMigration as Record<string, unknown> | null)
      ?.stage1;
    if (!club || done) return;
    await this.stage1(clubId).catch((error) =>
      this.logger.error(`Etapa 1 del club ${clubId} falló: ${String(error)}`),
    );
  }

  /** Todos los clubes (o uno). Con `force` vuelve a copiar aunque ya esté marcado. */
  async stage1All(options: { clubId?: string; force?: boolean } = {}) {
    const clubs = await this.prisma.club.findMany({
      where: options.clubId ? { id: options.clubId } : {},
      select: { id: true, firestoreMigration: true },
      orderBy: { name: 'asc' },
    });
    const reports: Stage1Report[] = [];
    for (const club of clubs) {
      const done = (club.firestoreMigration as Record<string, unknown> | null)
        ?.stage1;
      if (done && !options.force) continue;
      reports.push(await this.stage1(club.id));
    }
    return reports;
  }

  stage1(clubId: string): Promise<Stage1Report> {
    // Un solo copiado por club a la vez (dos pantallas pueden pedirlo juntas).
    const current = this.running.get(clubId);
    if (current) return current;
    const job = this.copyClub(clubId).finally(() =>
      this.running.delete(clubId),
    );
    this.running.set(clubId, job);
    return job;
  }

  private async copyClub(clubId: string): Promise<Stage1Report> {
    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        companyId: true,
        firestoreMigration: true,
      },
    });
    const report: Stage1Report = {
      clubId,
      clubName: club.name,
      disciplines: { created: 0, updated: 0 },
      divisions: { created: 0, updated: 0 },
      players: { created: 0, merged: 0, failed: 0 },
      errors: [],
    };
    const fail = (message: string) => {
      if (report.errors.length < MAX_ERRORS) report.errors.push(message);
    };

    const ref = this.firebase.firestore.collection('clubs').doc(clubId);
    const [disciplines, divisions, players] = await Promise.all([
      ref.collection('available_disciplines').get(),
      ref.collection('divisions').get(),
      ref.collection('players').get(),
    ]);

    // Disciplinas: una por deporte en cada club.
    for (const doc of disciplines.docs) {
      const raw = doc.data();
      const sportId = str(raw.sportId, 60) ?? doc.id;
      const data = disciplineData({
        ...raw,
        sportId,
        name: raw.customName ?? raw.name ?? sportId,
      });
      const existing = await this.prisma.clubDiscipline.findUnique({
        where: { clubId_sportId: { clubId, sportId } },
        select: { id: true },
      });
      try {
        if (existing) {
          await this.prisma.clubDiscipline.update({
            where: { id: existing.id },
            data,
          });
          report.disciplines.updated += 1;
        } else {
          await this.prisma.clubDiscipline.create({
            data: {
              ...(data as Prisma.ClubDisciplineUncheckedCreateInput),
              id: `${clubId}_${sportId}`,
              companyId: club.companyId,
              clubId,
              sportId,
              name: (data.name as string) ?? sportId,
              createdAt: parseDay(raw.createdAt) ?? undefined,
            },
          });
          report.disciplines.created += 1;
        }
      } catch (error) {
        fail(`Disciplina ${doc.id}: ${String(error)}`);
      }
    }

    // Ramas: mismo id que en Firestore (los planteles siguen colgando de él).
    const divisionIds = new Set<string>();
    for (const doc of divisions.docs) {
      const raw = doc.data();
      const data = divisionData({ ...raw, name: raw.name ?? 'Rama' });
      try {
        const existing = await this.prisma.division.findUnique({
          where: { id: doc.id },
          select: { id: true },
        });
        if (existing) {
          await this.prisma.division.update({ where: { id: doc.id }, data });
          report.divisions.updated += 1;
        } else {
          await this.prisma.division.create({
            data: {
              ...(data as Prisma.DivisionUncheckedCreateInput),
              id: doc.id,
              companyId: club.companyId,
              clubId,
              name: (data.name as string) ?? 'Rama',
            },
          });
          report.divisions.created += 1;
        }
        divisionIds.add(doc.id);
      } catch (error) {
        fail(`Rama ${doc.id}: ${String(error)}`);
      }
    }

    // Jugadores: se unen con la ficha del padrón si ya existe (mismo id, uid o DNI).
    for (const doc of players.docs) {
      const raw = doc.data();
      try {
        const outcome = await this.copyPlayer(club, doc.id, raw, divisionIds);
        report.players[outcome] += 1;
      } catch (error) {
        report.players.failed += 1;
        fail(
          `Jugador ${doc.id} (${str(raw.firstName) ?? ''} ${str(raw.lastName) ?? ''}): ${String(error)}`,
        );
      }
    }

    // Disciplinas del club en el padrón público (la app las usa para filtrar).
    await this.syncClubSports(clubId);

    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        firestoreMigration: {
          ...((club.firestoreMigration as Record<string, unknown> | null) ??
            {}),
          stage1: new Date().toISOString(),
        },
      },
    });
    this.logger.log(
      `Etapa 1 ${club.name}: ${report.disciplines.created + report.disciplines.updated} disciplinas, ` +
        `${report.divisions.created + report.divisions.updated} ramas, ` +
        `${report.players.created + report.players.merged} jugadores (${report.players.failed} con error)`,
    );
    return report;
  }

  private async copyPlayer(
    club: { id: string; companyId: string },
    docId: string,
    raw: Doc,
    divisionIds: Set<string>,
  ): Promise<'created' | 'merged'> {
    const fields: Doc = { ...raw };
    // La rama se enlaza solo si existe; si no, queda en extra como estaba.
    const divisionId = str(raw.divisionId, 60);
    if (divisionId && !divisionIds.has(divisionId)) {
      delete fields.divisionId;
      fields.legacyDivisionId = divisionId;
    }
    const authUid = str(raw.authUid, 128) ?? str(raw.uid, 128);
    const dni = str(raw.dni, 20)?.replace(/\D/g, '') || null;

    const match = await this.prisma.player.findFirst({
      where: {
        companyId: club.companyId,
        OR: [
          { id: docId },
          { legacyId: docId },
          { authUid: docId },
          ...(authUid ? [{ authUid }] : []),
          ...(dni ? [{ dni }] : []),
        ],
      },
      select: {
        id: true,
        legacyId: true,
        extra: true,
        firstName: true,
        email: true,
        authUid: true,
      },
    });

    const data = playerData(fields, match?.extra ?? null);
    if (!data.firstName && !match)
      data.firstName = str(raw.name) ?? 'Sin nombre';
    if (!data.lastName && !match) data.lastName = '';
    if (authUid && !data.authUid) data.authUid = authUid;

    if (match) {
      // Lo que ya tenía el padrón manda en identidad; Firestore aporta lo deportivo.
      delete data.firstName;
      delete data.lastName;
      if (match.email) delete data.email;
      if (match.authUid) delete data.authUid;
      if (match.id !== docId && !match.legacyId) data.legacyId = docId;
      await this.safeUpdate(match.id, data);
      return 'merged';
    }

    await this.safeCreate({
      ...(data as Prisma.PlayerUncheckedCreateInput),
      id: docId,
      companyId: club.companyId,
      clubId: club.id,
      firstName: (data.firstName as string) ?? 'Sin nombre',
      lastName: (data.lastName as string) ?? '',
      createdAt: parseDay(raw.createdAt) ?? undefined,
    });
    return 'created';
  }

  /** Si el email o el uid ya están en otra ficha, se guarda sin ellos (quedan en extra). */
  private async safeCreate(data: Prisma.PlayerUncheckedCreateInput) {
    try {
      await this.prisma.player.create({ data });
    } catch (error) {
      if (!isUnique(error)) throw error;
      const { email, authUid, ...rest } = data;
      await this.prisma.player.create({
        data: {
          ...rest,
          extra: {
            ...((rest.extra as Doc | undefined) ?? {}),
            emailConflict: email ?? null,
            uidConflict: authUid ?? null,
          },
        },
      });
    }
  }

  private async safeUpdate(id: string, data: Record<string, unknown>) {
    try {
      await this.prisma.player.update({ where: { id }, data });
    } catch (error) {
      if (!isUnique(error)) throw error;
      const { email: _email, authUid: _uid, legacyId: _legacy, ...rest } = data;
      void _email;
      void _uid;
      void _legacy;
      await this.prisma.player.update({ where: { id }, data: rest });
    }
  }

  async syncClubSports(clubId: string) {
    const list = await this.prisma.clubDiscipline.findMany({
      where: {
        clubId,
        NOT: { status: { in: ['inactive', 'inactivo', 'archived'] } },
      },
      select: { sportId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (list.length === 0) return;
    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        sport: list
          .map((item) => item.sportId)
          .join(',')
          .slice(0, 400),
      },
    });
  }
}

function isUnique(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export { plain };
