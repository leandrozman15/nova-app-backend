import { MatchStatus } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';

export type LiveIncident = {
  type: 'goal' | 'try' | 'yellow' | 'red';
  playerName: string | null;
  minute: number | null;
  /** 'home' = el equipo local del marcador. */
  side: 'home' | 'away';
};

export type LiveItem = {
  id: string;
  source: 'club' | 'league';
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeScore: number;
  awayScore: number;
  phase: 'en_curso' | 'entretiempo' | 'finalizado';
  timeDisplay: string | null;
  /** Tiempo actual y cantidad de tiempos (2, 3 o 4 cuartos). */
  period: number | null;
  totalPeriods: number | null;
  /** Categoría del partido (equipo y división) para que cada pantalla muestre solo la suya. */
  teamId: string | null;
  divisionId: string | null;
  divisionName: string | null;
  sport: string | null;
  incidents: LiveIncident[];
};

type Doc = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const STALE_MS = 6 * 60 * 60 * 1000;

const INCIDENT_TYPES = new Set(['goal', 'try', 'yellow', 'red']);

/** Incidencias que publica el Live del entrenador en el índice (goles y tarjetas con jugador y minuto). */
export function incidentsOf(raw: unknown): LiveIncident[] {
  if (!Array.isArray(raw)) return [];
  const out: LiveIncident[] = [];
  for (const r of raw as Doc[]) {
    const type = str(r?.type);
    if (!type || !INCIDENT_TYPES.has(type)) continue;
    out.push({
      type: type as LiveIncident['type'],
      playerName: str(r.playerName),
      minute: num(r.minute),
      side: r.side === 'away' ? 'away' : 'home',
    });
  }
  return out.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

/**
 * Partidos en vivo de un club para las familias, con escudos, goles (quién y minuto) y tarjetas.
 * Dos orígenes: el Live del entrenador (índice live_matches_index) y los partidos de liga en vivo.
 */
export async function loadClubLive(
  prisma: Pick<PrismaService, 'storeDocument' | 'match' | 'club'>,
  companyId: string,
  clubId: string,
  now = Date.now(),
): Promise<LiveItem[]> {
  const out: LiveItem[] = [];

  // Escudos: si el Live no los trajo (cliente viejo o sin logo cargado), se completan desde los clubes.
  const ownClub = await prisma.club.findMany({ where: { id: clubId }, select: { id: true, logoUrl: true } });
  const ownLogo = ownClub[0]?.logoUrl ?? null;

  const index = await prisma.storeDocument.findMany({
    where: { companyId, collection: 'live_matches_index', data: { path: ['clubId'], equals: clubId } },
    select: { docId: true, data: true },
  });
  for (const row of index) {
    const d = (row.data ?? {}) as Doc;
    if (d.status !== 'live') continue;
    const updated = Date.parse(String(d.updatedAt ?? ''));
    if (!Number.isNaN(updated) && now - updated > STALE_MS) continue; // un live olvidado no queda "en vivo" para siempre
    const phase = d.matchPhase === 'entretiempo' ? 'entretiempo' : d.matchPhase === 'finalizado' ? 'finalizado' : 'en_curso';
    out.push({
      id: `ix:${row.docId}`,
      source: 'club',
      homeName: str(d.teamName) ?? str(d.clubName) ?? 'Local',
      awayName: str(d.opponentName) ?? 'Visitante',
      homeLogo: str(d.clubLogo) ?? ownLogo,
      awayLogo: str(d.opponentLogo),
      homeScore: num(d.homeScore) ?? 0,
      awayScore: num(d.awayScore) ?? 0,
      phase,
      timeDisplay: str(d.timeDisplay),
      period: num(d.period),
      totalPeriods: num(d.totalPeriods),
      teamId: str(d.teamId),
      divisionId: str(d.divisionId),
      divisionName: str(d.divisionName),
      sport: str(d.sport),
      incidents: incidentsOf(d.incidents),
    });
  }

  const needOpp = out.filter((o) => o.source === 'club' && !o.awayLogo);
  if (needOpp.length > 0) {
    const norm = (v: string) => v.toLowerCase().replace(/\s+·\s+div\..*$/, '').replace(/\s+/g, ' ').trim();
    const logos = new Map<string, string>();
    // Rivales cargados en el club (los que se eligen al armar el fixture).
    const opponents = await prisma.storeDocument.findMany({
      where: { companyId, parentPath: `clubs/${clubId}/opponents` },
      select: { data: true },
    });
    for (const r of opponents) {
      const d = (r.data ?? {}) as Doc;
      const n = str(d.name);
      const l = str(d.logoUrl);
      if (n && l) logos.set(norm(n), l);
    }
    // Y clubes registrados en la plataforma con el mismo nombre.
    const names = [...new Set(needOpp.map((o) => o.awayName))];
    const byName = await prisma.club.findMany({
      where: { companyId, name: { in: names, mode: 'insensitive' }, logoUrl: { not: null } },
      select: { name: true, logoUrl: true },
    });
    for (const c of byName) if (!logos.has(norm(c.name))) logos.set(norm(c.name), c.logoUrl as string);
    for (const o of needOpp) o.awayLogo = logos.get(norm(o.awayName)) ?? null;
  }

  const league = await prisma.match.findMany({
    where: { companyId, status: MatchStatus.live, OR: [{ homeTeam: { clubId } }, { awayTeam: { clubId } }] },
    select: {
      id: true,
      homeScore: true,
      awayScore: true,
      homeTeamId: true,
      homeTeam: { select: { name: true, clubId: true } },
      awayTeam: { select: { name: true, clubId: true } },
      events: {
        where: { type: { in: ['goal', 'own_goal', 'yellow_card', 'red_card'] } },
        orderBy: { minute: 'asc' },
        select: { type: true, minute: true, teamId: true, player: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (league.length > 0) {
    const clubIds = [...new Set(league.flatMap((m) => [m.homeTeam?.clubId, m.awayTeam?.clubId]).filter((x): x is string => !!x))];
    const clubs = await prisma.club.findMany({ where: { id: { in: clubIds } }, select: { id: true, logoUrl: true } });
    const logo = new Map(clubs.map((c) => [c.id, c.logoUrl ?? null]));
    for (const m of league) {
      out.push({
        id: `lg:${m.id}`,
        source: 'league',
        homeName: m.homeTeam?.name ?? 'Local',
        awayName: m.awayTeam?.name ?? 'Visitante',
        homeLogo: (m.homeTeam?.clubId && logo.get(m.homeTeam.clubId)) || null,
        awayLogo: (m.awayTeam?.clubId && logo.get(m.awayTeam.clubId)) || null,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        phase: 'en_curso',
        timeDisplay: null,
        period: null,
        totalPeriods: null,
        teamId: null,
        divisionId: null,
        divisionName: null,
        sport: null,
        incidents: m.events.map((e) => {
          const own = e.type === 'own_goal';
          const fromHome = e.teamId === m.homeTeamId;
          return {
            type: e.type === 'yellow_card' ? 'yellow' : e.type === 'red_card' ? 'red' : 'goal',
            playerName: e.player ? `${e.player.firstName} ${e.player.lastName}`.trim() : null,
            minute: e.minute,
            // Un gol en contra suma al otro equipo.
            side: (own ? !fromHome : fromHome) ? 'home' : 'away',
          } as LiveIncident;
        }),
      });
    }
  }
  return out;
}
