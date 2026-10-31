import { ClubsService } from './clubs.service';

describe('ClubsService.leagueBrackets', () => {
  const build = () => {
    const prisma: any = {
      club: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
      leagueTournament: {
        findMany: jest.fn().mockResolvedValue([
          { id: 't1', name: 'Copa', formatType: 'knockout', status: 'active', groupCount: null, advancePerGroup: null, clubs: [{ clubId: 'c1', club: { logoUrl: 'a.png' } }, { clubId: 'c2', club: { logoUrl: null } }] },
          { id: 't2', name: 'Grupos+KO', formatType: 'groups_knockout', status: 'active', groupCount: 2, advancePerGroup: 2, clubs: [{ clubId: 'c1', club: null }] },
        ]),
      },
      match: { findMany: jest.fn().mockResolvedValue([{ id: 'm1', stage: 'knockout', round: 1, bracketSlot: 0 }]) },
    };
    return { prisma, service: new ClubsService(prisma) };
  };

  it('devuelve torneos de llave del club con partidos, escudos y cantidad de equipos', async () => {
    const { prisma, service } = build();
    const r = await service.leagueBrackets('co', 'c1');
    expect(prisma.leagueTournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'co', formatType: { in: ['knockout', 'groups_knockout'] }, clubs: { some: { clubId: 'c1' } } } }),
    );
    expect(r.map((t) => [t.id, t.teamCount])).toEqual([['t1', 2], ['t2', 4]]);
    expect(r[0].logos).toEqual({ c1: 'a.png', c2: null });
    expect(r[0].matches).toHaveLength(1);
    expect(prisma.match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'co', tournamentId: 't1', stage: { in: ['knockout', 'third_place'] } } }),
    );
  });
});
