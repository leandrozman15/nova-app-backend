import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { FirestoreMigrationService } from '../roster/firestore-migration.service';
import { DocStoreMigrationService } from '../docstore/docstore-migration.service';
import { toDisciplineDoc } from '../roster/roster.mapper';

/**
 * Lee las disciplinas que el club ya cargó en la consola (Firestore:
 * clubs/{id}/available_disciplines) y los horarios de sus planteles
 * (clubs/{id}/divisions/{id}/teams) para mostrarlos en la app como actividades,
 * sin duplicar datos. Solo lectura y solo campos de vidriera.
 */

const DAY_INDEX: Record<string, number> = {
  lun: 0,
  mar: 1,
  mie: 2,
  jue: 3,
  vie: 4,
  sab: 5,
  dom: 6,
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const INACTIVE = new Set(['inactive', 'inactivo', 'archived']);
const CACHE_MS = 2 * 60 * 1000;

function isInactive(status: unknown) {
  return typeof status === 'string' && INACTIVE.has(status.toLowerCase());
}

export const DISCIPLINE_ID_PREFIX = 'disc_';

export type DisciplineGroup = {
  name: string;
  schedule: { day: number; start: string; end: string }[];
  coaches: string[];
};

export type PublicDiscipline = {
  id: string;
  kind: 'discipline';
  name: string;
  sport: string | null;
  emoji: string | null;
  season: string | null;
  audience: string | null;
  description: string | null;
  coaches: string[];
  groups: DisciplineGroup[];
};

type Doc = Record<string, unknown>;

function text(value: unknown, max = 120): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

function realName(value: unknown) {
  const name = text(value, 80);
  return name && !/^no asignado$/i.test(name) ? name : null;
}

function dayIndex(value: unknown) {
  if (typeof value !== 'string') return null;
  const key = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .slice(0, 3);
  return DAY_INDEX[key] ?? null;
}

/** "Mixto · 6 a 50 años", "Femenino · desde 9 años". */
export function describeAudience(discipline: Doc) {
  const gender =
    discipline.gender === 'female'
      ? 'Femenino'
      : discipline.gender === 'male'
        ? 'Masculino'
        : discipline.gender === 'both'
          ? 'Mixto'
          : null;
  const min = Number(discipline.minAge);
  const max = Number(discipline.maxAge);
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0 && max < 90;
  const ages =
    hasMin && hasMax
      ? `${min} a ${max} años`
      : hasMin
        ? `desde ${min} años`
        : hasMax
          ? `hasta ${max} años`
          : null;
  return [gender, ages].filter(Boolean).join(' · ') || null;
}

/** Horario semanal de un plantel (trainingDays + trainingStart/EndTime). */
export function teamSchedule(team: Doc) {
  const start = text(team.trainingStartTime, 5);
  const end = text(team.trainingEndTime, 5);
  if (!start || !end || !TIME.test(start) || !TIME.test(end) || end <= start)
    return [];
  const days = Array.isArray(team.trainingDays) ? team.trainingDays : [];
  return [...new Set(days.map(dayIndex).filter((day) => day !== null))]
    .sort((a, b) => a - b)
    .map((day) => ({ day, start, end }));
}

/** Arma la actividad pública de una disciplina con los planteles de su deporte. */
export function toPublicDiscipline(
  id: string,
  discipline: Doc,
  teams: Doc[],
  includeCoaches: boolean,
): PublicDiscipline {
  const sport = text(discipline.sportId, 40) ?? id;
  const groups = teams
    .filter((team) => !isInactive(team.status))
    .map((team) => ({
      name: text(team.name, 80) ?? 'Plantel',
      schedule: teamSchedule(team),
      coaches: includeCoaches
        ? [realName(team.coachName), realName(team.assistantCoachName)].filter(
            (name): name is string => Boolean(name),
          )
        : [],
    }))
    .filter((group) => group.schedule.length > 0 || group.coaches.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const coordinator = includeCoaches
    ? realName(discipline.coordinatorName)
    : null;
  return {
    id: `${DISCIPLINE_ID_PREFIX}${id}`,
    kind: 'discipline',
    name:
      text(discipline.customName) ??
      text(discipline.name) ??
      sport ??
      'Deporte',
    sport,
    emoji: text(discipline.emoji, 8),
    season: text(discipline.season, 20),
    audience: describeAudience(discipline),
    description: text(discipline.description, 1500),
    coaches: coordinator ? [coordinator] : [],
    groups,
  };
}

@Injectable()
export class ClubDisciplinesService {
  private readonly logger = new Logger(ClubDisciplinesService.name);
  private readonly cache = new Map<
    string,
    { at: number; data: PublicDiscipline[] }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: FirestoreMigrationService,
    private readonly docs: DocStoreMigrationService,
  ) {}

  /** Disciplinas activas del club. Si Firestore falla, la ficha sigue sin ellas. */
  async listPublic(
    clubId: string,
    includeCoaches: boolean,
  ): Promise<PublicDiscipline[]> {
    const key = `${clubId}:${includeCoaches}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

    try {
      const data = await this.load(clubId, includeCoaches);
      this.cache.set(key, { at: Date.now(), data });
      return data;
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer las disciplinas del club ${clubId}: ${String(error)}`,
      );
      return cached?.data ?? [];
    }
  }

  async exists(clubId: string, disciplineId: string) {
    const list = await this.listPublic(clubId, false);
    return list.find((item) => item.id === disciplineId) ?? null;
  }

  private async load(clubId: string, includeCoaches: boolean) {
    // Disciplinas y ramas en Postgres; los planteles siguen en Firestore (etapa 2).
    await this.migration.ensureStage1(clubId);
    await this.docs.ensureStage2(clubId);
    const [disciplines, divisions] = await Promise.all([
      this.prisma.clubDiscipline.findMany({ where: { clubId } }),
      this.prisma.division.findMany({
        where: { clubId },
        select: { id: true, sport: true },
      }),
    ]);
    const active = disciplines.filter((item) => !isInactive(item.status));
    if (active.length === 0) return [];

    // Planteles en el almacén de documentos (etapa 2), bajo cada rama.
    const teamRows = await this.prisma.storeDocument.findMany({
      where: {
        clubId,
        collection: 'teams',
        parentPath: {
          in: divisions.map(
            (division) => `clubs/${clubId}/divisions/${division.id}/teams`,
          ),
        },
      },
      select: { parentPath: true, data: true },
    });
    const sportOfDivision = new Map(
      divisions.map((division) => [
        `clubs/${clubId}/divisions/${division.id}/teams`,
        division.sport,
      ]),
    );
    const teamsBySport = new Map<string, Doc[]>();
    for (const row of teamRows) {
      const data = (row.data ?? {}) as Doc;
      const sport =
        text(data.sport, 40) ?? text(sportOfDivision.get(row.parentPath), 40);
      if (!sport) continue;
      teamsBySport.set(sport, [...(teamsBySport.get(sport) ?? []), data]);
    }

    return active
      .map((item) => {
        const data = toDisciplineDoc(item);
        return toPublicDiscipline(
          item.id,
          data,
          teamsBySport.get(item.sportId) ?? [],
          includeCoaches,
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
}
