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
    // Por club, no por empresa: quien publica y quien mira pueden tener activa una empresa distinta (clubes registrados
    // desde una liga) y el club ya está validado por el permiso del endpoint.
    where: {
      collection: 'live_matches_index',
      OR: [{ clubId }, { data: { path: ['clubId'], equals: clubId } }],
    },
    select: { docId: true, data: true },
  });
  const liveRivals = new Set<string>();
  const normName = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
  /** Tarjetas del Live que están enlazadas a un partido de liga (se reemplazan por la tarjeta de la liga con sus datos). */
  const indexLinks = new Map<string, string>();
  for (const row of index) {
    const d = (row.data ?? {}) as Doc;
    if (d.status !== 'live') continue;
    const updated = Date.parse(String(d.updatedAt ?? ''));
    if (!Number.isNaN(updated) && now - updated > STALE_MS) continue; // un live olvidado no queda "en vivo" para siempre
    const linked = str(d.backendMatchId);
    if (linked) indexLinks.set(`ix:${row.docId}`, linked);
    const rival = str(d.opponentName);
    if (rival) liveRivals.add(normName(rival));
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

  // Transmisiones del Live enlazadas a un partido de liga, de cualquiera de los dos clubes: así quien mira desde
  // el club rival también ve marcador, reloj y tiempo (el índice solo está marcado con el club que transmite).
  const allIndex = await prisma.storeDocument.findMany({
    where: { companyId, collection: 'live_matches_index' },
    select: { docId: true, data: true },
  });
  const liveByMatch = new Map<string, Doc>();
  for (const row of allIndex) {
    const d = (row.data ?? {}) as Doc;
    const linked = str(d.backendMatchId);
    if (!linked || d.status !== 'live') continue;
    const updated = Date.parse(String(d.updatedAt ?? ''));
    if (!Number.isNaN(updated) && now - updated > STALE_MS) continue;
    liveByMatch.set(linked, d);
  }

  const league = await prisma.match.findMany({
    where: {
      companyId,
      AND: [
        { OR: [{ homeTeam: { clubId } }, { awayTeam: { clubId } }] },
        { OR: [{ status: MatchStatus.live }, ...(liveByMatch.size > 0 ? [{ id: { in: [...liveByMatch.keys()] } }] : [])] },
      ],
    },
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
    const includedLeague = new Set<string>();
    for (const m of league) {
      const live = liveByMatch.get(m.id);
      const rivalName = m.homeTeam?.clubId === clubId ? m.awayTeam?.name : m.homeTeam?.name;
      // Sin datos del Live (cliente viejo): si el entrenador transmite a este rival, no se repite el partido en cero.
      if (!live && rivalName && liveRivals.has(normName(rivalName))) continue;
      includedLeague.add(m.id);
      // El marcador y las incidencias del Live están desde la mirada del equipo que transmite; si es el visitante, se invierten.
      const mineHome = live ? live.mineHome !== false : true;
      const flip = (side: 'home' | 'away'): 'home' | 'away' => (mineHome ? side : side === 'home' ? 'away' : 'home');
      const phase = live ? (live.matchPhase === 'entretiempo' ? 'entretiempo' : live.matchPhase === 'finalizado' ? 'finalizado' : 'en_curso') : 'en_curso';
      out.push({
        id: `lg:${m.id}`,
        source: 'league',
        homeName: m.homeTeam?.name ?? 'Local',
        awayName: m.awayTeam?.name ?? 'Visitante',
        homeLogo: (m.homeTeam?.clubId && logo.get(m.homeTeam.clubId)) || null,
        awayLogo: (m.awayTeam?.clubId && logo.get(m.awayTeam.clubId)) || null,
        homeScore: live ? (mineHome ? num(live.homeScore) : num(live.awayScore)) ?? m.homeScore : m.homeScore,
        awayScore: live ? (mineHome ? num(live.awayScore) : num(live.homeScore)) ?? m.awayScore : m.awayScore,
        phase,
        timeDisplay: live ? str(live.timeDisplay) : null,
        period: live ? num(live.period) : null,
        totalPeriods: live ? num(live.totalPeriods) : null,
        teamId: live ? str(live.teamId) : null,
        divisionId: live ? str(live.divisionId) : null,
        divisionName: live ? str(live.divisionName) : null,
        sport: live ? str(live.sport) : null,
        incidents: live
          ? incidentsOf(live.incidents).map((i) => ({ ...i, side: flip(i.side) }))
          : m.events.map((e) => {
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
    // La tarjeta del Live enlazada a un partido de liga ya está incluida arriba, con los datos del Live.
    for (let i = out.length - 1; i >= 0; i--) {
      const linked = indexLinks.get(out[i].id);
      if (linked && includedLeague.has(linked)) out.splice(i, 1);
    }
  }
  return out;
}
