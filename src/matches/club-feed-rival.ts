import type { PrismaService } from '../prisma/prisma.service';

/** Ficha del rival y de la sede para el próximo partido (familias y jugadores). */

type TeamRef = { id: string; name: string; clubId?: string | null };
type FeedMatch = {
  id: string;
  venue?: string | null;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  tournament?: { id: string; name: string } | null;
};

export type PlaceInfo = {
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type RivalStanding = {
  position: number;
  total: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
};

export type MatchRivalCard = {
  rival: (PlaceInfo & { teamId: string; standing: RivalStanding | null }) | null;
  /** Sede del partido: el club local (con su dirección para "Cómo llegar"). */
  place: (PlaceInfo & { venue: string | null }) | null;
};

export const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

type Played = { homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number; status: string };

/** Tabla por puntos (3/1/0), diferencia de gol y goles a favor. Incluye a todos los equipos del torneo. */
export function buildTable(matches: Played[]) {
  const rows = new Map<string, { teamId: string; points: number; gf: number; ga: number; played: number; won: number; drawn: number; lost: number }>();
  const row = (id: string) => {
    if (!rows.has(id)) rows.set(id, { teamId: id, points: 0, gf: 0, ga: 0, played: 0, won: 0, drawn: 0, lost: 0 });
    return rows.get(id)!;
  };
  for (const m of matches) {
    const h = row(m.homeTeamId);
    const a = row(m.awayTeamId);
    if (m.status !== 'played') continue;
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h.points += 3; h.won++; a.lost++; }
    else if (m.homeScore < m.awayScore) { a.points += 3; a.won++; h.lost++; }
    else { h.points++; a.points++; h.drawn++; a.drawn++; }
  }
  return [...rows.values()].sort(
    (x, y) => y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf,
  );
}

export function standingOf(table: ReturnType<typeof buildTable>, teamId: string): RivalStanding | null {
  const idx = table.findIndex((r) => r.teamId === teamId);
  if (idx < 0) return null;
  const r = table[idx];
  return { position: idx + 1, total: table.length, points: r.points, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost };
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? n : null;
};

export async function buildRivalCards(
  prisma: Pick<PrismaService, 'club' | 'storeDocument' | 'match'>,
  clubId: string,
  matches: FeedMatch[],
): Promise<Map<string, MatchRivalCard>> {
  const out = new Map<string, MatchRivalCard>();
  if (matches.length === 0) return out;

  const clubIds = [...new Set(matches.flatMap((m) => [m.homeTeam.clubId, m.awayTeam.clubId]).filter((v): v is string => !!v))];
  const tournamentIds = [...new Set(matches.map((m) => m.tournament?.id).filter((v): v is string => !!v))];

  const [clubs, opponentDocs, tournamentMatches] = await Promise.all([
    prisma.club.findMany({
      where: { id: { in: clubIds } },
      select: { id: true, name: true, logoUrl: true, coverUrl: true, address: true, city: true, latitude: true, longitude: true },
    }),
    prisma.storeDocument.findMany({ where: { parentPath: `clubs/${clubId}/opponents` }, select: { data: true } }),
    tournamentIds.length
      ? prisma.match.findMany({
          where: { tournamentId: { in: tournamentIds }, OR: [{ stage: null }, { stage: { notIn: ['knockout', 'third_place'] } }] },
          select: { tournamentId: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const clubById = new Map(clubs.map((c) => [c.id, c]));
  const opponents = opponentDocs.map((d) => (d.data ?? {}) as Record<string, unknown>);
  const tables = new Map<string, ReturnType<typeof buildTable>>();
  for (const tid of tournamentIds) {
    tables.set(tid, buildTable(tournamentMatches.filter((m) => m.tournamentId === tid) as Played[]));
  }

  /** Datos de un club: la ficha cargada en "Clubes rivales" tiene prioridad sobre la del club en la plataforma. */
  const place = (team: TeamRef): PlaceInfo => {
    const club = team.clubId ? clubById.get(team.clubId) : undefined;
    const keys = [norm(team.name), norm(club?.name)].filter(Boolean);
    const opp = opponents.find((o) => {
      const n = norm(str(o.name));
      return n && keys.some((k) => k === n || k.includes(n) || n.includes(k));
    });
    return {
      name: str(opp?.name) ?? club?.name ?? team.name,
      shortName: str(opp?.shortName),
      logoUrl: str(opp?.logoUrl) ?? club?.logoUrl ?? null,
      coverUrl: str(opp?.coverUrl) ?? club?.coverUrl ?? null,
      address: str(opp?.address) ?? club?.address ?? null,
      city: str(opp?.city) ?? club?.city ?? null,
      latitude: num(opp?.latitude) ?? club?.latitude ?? null,
      longitude: num(opp?.longitude) ?? club?.longitude ?? null,
    };
  };

  for (const m of matches) {
    const mineIsHome = m.homeTeam.clubId === clubId;
    const mineIsAway = m.awayTeam.clubId === clubId;
    const rivalTeam = mineIsHome && !mineIsAway ? m.awayTeam : mineIsAway && !mineIsHome ? m.homeTeam : null;
    const table = m.tournament?.id ? tables.get(m.tournament.id) : undefined;
    out.set(m.id, {
      rival: rivalTeam ? { ...place(rivalTeam), teamId: rivalTeam.id, standing: table ? standingOf(table, rivalTeam.id) : null } : null,
      place: { ...place(m.homeTeam), venue: m.venue ?? null },
    });
  }
  return out;
}
