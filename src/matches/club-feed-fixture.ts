import type { PrismaService } from '../prisma/prisma.service';
import { MatchRivalCard, PlaceInfo, norm, num, str } from './club-feed-rival';

/**
 * Partidos que la dirección carga en el Fixture del club (torneos propios, guardados como documentos
 * en clubs/{clubId}/tournaments/{id}/matches). Se suman al feed de familias y jugadores con la misma forma
 * que los partidos de liga, incluida la ficha del rival.
 */

type Doc = Record<string, unknown>;

export type FixtureFeedMatch = {
  id: string;
  scheduledAt: string;
  status: 'scheduled' | 'live' | 'played';
  homeScore: number;
  awayScore: number;
  venue: string | null;
  label: string | null;
  round: number | null;
  homeTeam: { id: string; name: string; clubId?: string };
  awayTeam: { id: string; name: string; clubId?: string };
  tournament: { id: string; name: string } | null;
  scheduleChange: null;
  rival: MatchRivalCard['rival'];
  place: MatchRivalCard['place'];
  /** Amistoso: no cuenta para la tabla de posiciones. */
  friendly: boolean;
};

/** "2026-11-07T17:30" (hora del club, sin zona) a instante UTC. Argentina no tiene horario de verano: -03:00. */
export function fixtureInstant(date: unknown): string | null {
  const raw = str(date);
  if (!raw) return null;
  let text = raw;
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const local = raw.length === 10 ? `${raw}T00:00:00` : raw.length === 16 ? `${raw}:00` : raw;
    text = `${local}-03:00`;
  }
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

type StandingRow = { teamId: string; teamName: string; points: number; played: number; won: number; drawn: number; lost: number; gf: number; ga: number };

function tableOf(rows: Doc[]): StandingRow[] {
  return rows
    .map((r) => ({
      teamId: str(r.teamId) ?? '',
      teamName: str(r.teamName) ?? '',
      points: num(r.points) ?? 0,
      played: num(r.played) ?? 0,
      won: num(r.won) ?? 0,
      drawn: num(r.drawn) ?? 0,
      lost: num(r.lost) ?? 0,
      gf: num(r.goalsFor) ?? 0,
      ga: num(r.goalsAgainst) ?? 0,
    }))
    .sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
}

const FINAL = new Set(['played']);

export async function loadFixtureFeed(
  prisma: Pick<PrismaService, 'storeDocument' | 'club'>,
  companyId: string,
  clubId: string,
  now = Date.now(),
): Promise<{ live: FixtureFeedMatch[]; upcoming: FixtureFeedMatch[]; recent: FixtureFeedMatch[] }> {
  const empty = { live: [], upcoming: [], recent: [] };
  const base = `clubs/${clubId}/tournaments`;
  const docs = await prisma.storeDocument.findMany({
    where: {
      companyId,
      OR: [
        { parentPath: base },
        { parentPath: { startsWith: `${base}/` }, collection: { in: ['matches', 'standings'] } },
        { parentPath: `clubs/${clubId}/opponents` },
      ],
    },
    select: { parentPath: true, collection: true, docId: true, data: true },
  });
  if (docs.length === 0) return empty;

  const tournaments = new Map<string, string>();
  const standingsBy = new Map<string, Doc[]>();
  const matches: { tid: string; id: string; d: Doc }[] = [];
  const opponents: Doc[] = [];
  for (const row of docs) {
    const d = (row.data ?? {}) as Doc;
    if (row.parentPath === base) tournaments.set(row.docId, str(d.name) ?? 'Torneo');
    else if (row.parentPath === `clubs/${clubId}/opponents`) opponents.push({ ...d, id: row.docId });
    else {
      const tid = row.parentPath.slice(base.length + 1).split('/')[0];
      if (row.collection === 'standings') standingsBy.set(tid, [...(standingsBy.get(tid) ?? []), d]);
      else if (row.collection === 'matches') matches.push({ tid, id: row.docId, d });
    }
  }

  const mine = matches.filter(({ d }) => str(d.homeParticipantId) === clubId || str(d.awayParticipantId) === clubId);
  if (mine.length === 0) return empty;

  const ownClub = await prisma.club.findFirst({
    where: { id: clubId, companyId },
    select: { name: true, logoUrl: true, coverUrl: true, address: true, city: true, latitude: true, longitude: true },
  });

  const placeOf = (participantId: string | null, name: string | null, logo: string | null): PlaceInfo => {
    if (participantId === clubId) {
      return {
        name: ownClub?.name ?? name ?? 'Mi club',
        shortName: null,
        logoUrl: ownClub?.logoUrl ?? logo,
        coverUrl: ownClub?.coverUrl ?? null,
        address: ownClub?.address ?? null,
        city: ownClub?.city ?? null,
        mapsUrl: null,
        latitude: ownClub?.latitude ?? null,
        longitude: ownClub?.longitude ?? null,
      };
    }
    const key = norm(name);
    const opp =
      opponents.find((o) => participantId && str(o.id) === participantId) ??
      opponents.find((o) => {
        const n = norm(str(o.name));
        return n && key && (n === key || key.includes(n) || n.includes(key));
      });
    return {
      name: str(opp?.name) ?? name ?? 'Rival',
      shortName: str(opp?.shortName),
      logoUrl: str(opp?.logoUrl) ?? logo,
      coverUrl: str(opp?.coverUrl),
      address: str(opp?.address),
      city: str(opp?.city),
      mapsUrl: str(opp?.mapsUrl),
      latitude: num(opp?.latitude),
      longitude: num(opp?.longitude),
    };
  };

  const out: FixtureFeedMatch[] = [];
  for (const { tid, id, d } of mine) {
    const at = fixtureInstant(d.date);
    if (!at) continue; // sin día y hora no se puede mostrar a las familias
    const homeId = str(d.homeParticipantId) ?? '';
    const awayId = str(d.awayParticipantId) ?? '';
    const homeName = str(d.homeParticipantName) ?? 'Local';
    const awayName = str(d.awayParticipantName) ?? 'Visitante';
    const mineHome = homeId === clubId;
    const rivalId = mineHome ? awayId : homeId;
    const rivalName = mineHome ? awayName : homeName;
    const rivalLogo = str(mineHome ? d.awayParticipantLogo : d.homeParticipantLogo);
    const table = tableOf(standingsBy.get(tid) ?? []);
    const idx = table.findIndex((r) => (rivalId && r.teamId === rivalId) || (!rivalId && norm(r.teamName) === norm(rivalName)));
    const status = str(d.status);
    const feedStatus: FixtureFeedMatch['status'] | null = status && FINAL.has(status) ? 'played' : status === 'live' ? 'live' : status === 'scheduled' || status === 'rescheduled' || !status ? 'scheduled' : null;
    if (!feedStatus) continue; // suspendido u otro estado: no se muestra como próximo
    out.push({
      id: `fx:${tid}:${id}`,
      scheduledAt: at,
      status: feedStatus,
      homeScore: num(d.homeScore) ?? 0,
      awayScore: num(d.awayScore) ?? 0,
      venue: null,
      label: str(d.phase) && str(d.phase) !== 'Regular' ? str(d.phase) : null,
      round: num(d.round) || null,
      homeTeam: { id: homeId, name: homeName, ...(mineHome ? { clubId } : {}) },
      awayTeam: { id: awayId, name: awayName, ...(!mineHome ? { clubId } : {}) },
      tournament: { id: tid, name: tournaments.get(tid) ?? 'Torneo' },
      scheduleChange: null,
      friendly: d.friendly === true,
      rival: {
        ...placeOf(rivalId || null, rivalName, rivalLogo),
        teamId: rivalId,
        standing:
          idx >= 0
            ? { position: idx + 1, total: table.length, points: table[idx].points, played: table[idx].played, won: table[idx].won, drawn: table[idx].drawn, lost: table[idx].lost }
            : null,
      },
      place: { ...placeOf(homeId || null, homeName, str(d.homeParticipantLogo)), venue: null },
    });
  }

  const since = now - 3 * 60 * 60 * 1000;
  const byAsc = (a: FixtureFeedMatch, b: FixtureFeedMatch) => a.scheduledAt.localeCompare(b.scheduledAt);
  return {
    live: out.filter((m) => m.status === 'live').sort(byAsc),
    upcoming: out.filter((m) => m.status === 'scheduled' && Date.parse(m.scheduledAt) >= since).sort(byAsc).slice(0, 15),
    recent: out.filter((m) => m.status === 'played').sort((a, b) => byAsc(b, a)).slice(0, 10),
  };
}
