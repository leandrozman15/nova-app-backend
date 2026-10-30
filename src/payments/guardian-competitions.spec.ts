import { loadClubCompetitions } from './guardian-competitions';

describe('loadClubCompetitions', () => {
  it('arma cada torneo con su tabla y sus partidos', async () => {
    const prisma: any = {
      storeDocument: {
        findMany: jest.fn().mockResolvedValue([
          { parentPath: 'clubs/c1/tournaments', collection: 'tournaments', docId: 't1', data: { name: 'Apertura' } },
          { parentPath: 'clubs/c1/tournaments/t1/standings', collection: 'standings', docId: 'a', data: { teamName: 'A', points: 3 } },
          { parentPath: 'clubs/c1/tournaments/t1/matches', collection: 'matches', docId: 'm1', data: { round: 1 } },
          { parentPath: 'clubs/c1/tournaments/zz/matches', collection: 'matches', docId: 'x', data: {} },
        ]),
      },
    };
    const r = await loadClubCompetitions(prisma, 'co', 'c1');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 't1', name: 'Apertura' });
    expect(r[0].standings).toEqual([{ teamName: 'A', points: 3, id: 'a' }]);
    expect(r[0].matches).toEqual([{ round: 1, id: 'm1' }]);
  });
});
