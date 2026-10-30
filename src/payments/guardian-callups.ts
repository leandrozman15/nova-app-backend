import type { PrismaService } from '../prisma/prisma.service';
import { fixtureInstant } from '../matches/club-feed-fixture';

/** Partido al que el entrenador citó a un jugador (ya publicado a las familias). */
export type ChildCallup = {
  id: string;
  source: 'league' | 'club';
  matchId: string;
  status: string;
  scheduledAt: string;
  title: string | null;
  homeName: string | null;
  awayName: string | null;
  location: string | null;
  departureTime: string | null;
  jersey: string | null;
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Citaciones publicadas y todavía vigentes de cada jugador, de las dos fuentes:
 * partidos de liga (tabla MatchCallup) y partidos del fixture del club (documentos match_callups).
 */
export async function loadChildCallups(
  prisma: Pick<PrismaService, 'matchCallup' | 'storeDocument'>,
  players: Array<{ id: string; companyId: string }>,
  now = Date.now(),
): Promise<Map<string, ChildCallup[]>> {
  const result = new Map<string, ChildCallup[]>();
  if (players.length === 0) return result;
  const since = new Date(now - 3 * 60 * 60 * 1000);
  const push = (playerId: string, c: ChildCallup) => result.set(playerId, [...(result.get(playerId) ?? []), c]);

  const league = await prisma.matchCallup.findMany({
    where: {
      playerExternalId: { in: players.map((p) => p.id) },
      publishedAt: { not: null },
      match: { scheduledAt: { gte: since } },
    },
    include: { match: { include: { homeTeam: true, awayTeam: true } } },
  });
  for (const c of league) {
    push(c.playerExternalId, {
      id: `lg:${c.id}`,
      source: 'league',
      matchId: c.matchId,
      status: c.status,
      scheduledAt: c.match.scheduledAt.toISOString(),
      title: text(c.match.label),
      homeName: c.match.homeTeam?.name ?? null,
      awayName: c.match.awayTeam?.name ?? null,
      location: text(c.match.venue),
      departureTime: text(c.match.busDepartureTime),
      jersey: text(c.match.jersey),
    });
  }

  for (const p of players) {
    const docs = await prisma.storeDocument.findMany({
      where: { companyId: p.companyId, collection: 'match_callups', data: { path: ['playerId'], equals: p.id } },
      select: { docId: true, data: true },
    });
    for (const row of docs) {
      const d = (row.data ?? {}) as Record<string, unknown>;
      if (d.published !== true) continue;
      const at = fixtureInstant(d.eventDate);
      if (!at || Date.parse(at) < since.getTime()) continue;
      push(p.id, {
        id: `fx:${row.docId}`,
        source: 'club',
        matchId: text(d.matchId) ?? row.docId,
        status: text(d.status) ?? 'pending',
        scheduledAt: at,
        title: text(d.eventTitle),
        homeName: text(d.eventHomeTeam),
        awayName: text(d.eventAwayTeam) ?? text(d.eventOpponent),
        location: text(d.eventLocation) ?? text(d.eventAddress),
        departureTime: text(d.eventDepartureTime),
        jersey: text(d.eventJersey),
      });
    }
  }

  for (const [id, list] of result) result.set(id, list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
  return result;
}
