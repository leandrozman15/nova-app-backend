import { MatchStatus } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';

/** Partidos del club para familias/jugadores: en vivo, próximos (con el horario cargado) y últimos resultados. */
export async function buildClubFeed(prisma: Pick<PrismaService, 'match'>, companyId: string, clubId: string) {
  const clubWhere = {
    companyId,
    OR: [{ homeTeam: { clubId } }, { awayTeam: { clubId } }],
  };
  const select = {
    id: true,
    scheduledAt: true,
    status: true,
    homeScore: true,
    awayScore: true,
    venue: true,
    label: true,
    round: true,
    homeTeam: { select: { id: true, name: true, clubId: true } },
    awayTeam: { select: { id: true, name: true, clubId: true } },
    tournament: { select: { id: true, name: true } },
    scheduleChanges: {
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: { kind: true, previousAt: true, newAt: true, deltaMinutes: true, reason: true, createdAt: true },
    },
  } as const;
  // Un partido "programado" sigue siendo próximo hasta 3 h después de su horario.
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);

  const [live, upcoming, recent] = await Promise.all([
    prisma.match.findMany({ where: { ...clubWhere, status: MatchStatus.live }, select, orderBy: { scheduledAt: 'asc' } }),
    prisma.match.findMany({
      where: { ...clubWhere, status: MatchStatus.scheduled, scheduledAt: { gte: since } },
      select,
      orderBy: { scheduledAt: 'asc' },
      take: 15,
    }),
    prisma.match.findMany({
      where: { ...clubWhere, status: MatchStatus.played },
      select,
      orderBy: { scheduledAt: 'desc' },
      take: 10,
    }),
  ]);
  // El último cambio de horario viaja como `scheduleChange` (solo importa en partidos no jugados).
  const shape = (list: typeof live, withChange: boolean) =>
    list.map(({ scheduleChanges, ...m }) => ({ ...m, scheduleChange: withChange ? (scheduleChanges[0] ?? null) : null }));
  return { live: shape(live, true), upcoming: shape(upcoming, true), recent: shape(recent, false) };
}
