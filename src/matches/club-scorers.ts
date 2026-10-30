import type { PrismaService } from '../prisma/prisma.service';

export type ScorerRow = {
  position: number;
  playerId: string;
  playerName: string;
  divisionId: string;
  divisionName: string | null;
  teamId: string;
  goals: number;
  trys: number;
  yellowCards: number;
  redCards: number;
  matches: number;
  /** Goles + tries: lo que ordena la tabla. */
  total: number;
};

type Doc = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/**
 * "clubs/c/divisions/d/teams/t/events/e/stats" → ids. Devuelve null si la ruta no es de estadísticas
 * de un partido de un equipo.
 */
export function parseStatsPath(parentPath: string) {
  const p = parentPath.split('/');
  if (p.length !== 9 || p[0] !== 'clubs' || p[2] !== 'divisions' || p[4] !== 'teams' || p[6] !== 'events' || p[8] !== 'stats') {
    return null;
  }
  return { divisionId: p[3], teamId: p[5], eventId: p[7] };
}

/** Pura: suma las estadísticas por jugador y ordena la tabla de goleadores. */
export function buildScorers(
  rows: Array<{ parentPath: string; data: unknown }>,
  filter: { divisionId?: string; teamId?: string } = {},
  divisionNames: Map<string, string> = new Map(),
): ScorerRow[] {
  const acc = new Map<string, Omit<ScorerRow, 'position' | 'total'> & { events: Set<string> }>();
  for (const r of rows) {
    const where = parseStatsPath(r.parentPath);
    if (!where) continue;
    if (filter.divisionId && where.divisionId !== filter.divisionId) continue;
    if (filter.teamId && where.teamId !== filter.teamId) continue;
    const d = (r.data ?? {}) as Doc;
    const playerId = str(d.playerId);
    if (!playerId) continue;
    const key = `${where.divisionId}:${playerId}`;
    const cur =
      acc.get(key) ??
      {
        playerId,
        playerName: str(d.playerName) || 'Jugador',
        divisionId: where.divisionId,
        divisionName: divisionNames.get(where.divisionId) ?? null,
        teamId: where.teamId,
        goals: 0,
        trys: 0,
        yellowCards: 0,
        redCards: 0,
        matches: 0,
        events: new Set<string>(),
      };
    cur.goals += num(d.goals);
    cur.trys += num(d.trys);
    cur.yellowCards += num(d.yellowCards);
    cur.redCards += num(d.redCards);
    if (num(d.minutesPlayed) > 0 || num(d.goals) > 0 || num(d.trys) > 0) cur.events.add(where.eventId);
    acc.set(key, cur);
  }
  return [...acc.values()]
    .map(({ events, ...v }) => ({ ...v, matches: events.size, total: v.goals + v.trys }))
    .filter((v) => v.total > 0)
    .sort((a, b) => b.total - a.total || b.goals - a.goals || a.matches - b.matches || a.playerName.localeCompare(b.playerName, 'es'))
    .map((v, i) => ({ ...v, position: i + 1 }));
}

/** Tabla de goleadores del club (o de una categoría / equipo) a partir de los partidos jugados con el Live. */
export async function loadClubScorers(
  prisma: Pick<PrismaService, 'storeDocument'>,
  companyId: string,
  clubId: string,
  filter: { divisionId?: string; teamId?: string } = {},
): Promise<ScorerRow[]> {
  const rows = await prisma.storeDocument.findMany({
    where: { companyId, collection: 'stats', path: { startsWith: `clubs/${clubId}/divisions/` } },
    select: { parentPath: true, data: true },
  });
  const divisions = await prisma.storeDocument.findMany({
    where: { companyId, parentPath: `clubs/${clubId}/divisions` },
    select: { docId: true, data: true },
  });
  const names = new Map<string, string>();
  for (const d of divisions) {
    const n = str(((d.data ?? {}) as Doc).name);
    if (n) names.set(d.docId, n);
  }
  return buildScorers(rows, filter, names);
}
