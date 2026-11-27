import { PadelRankingService } from './padel-ranking.service';

/** "Mi pádel" para un atleta sin club: su ficha de ranking y sus torneos, por usuario. */
describe('mi perfil y mis torneos (sin club)', () => {
  const mk = () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn(async () => ({ id: 'u1', name: 'Fran' })),
      },
      padelProfile: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.userId === 'u1'
            ? { id: 'p1', displayName: 'Fran', category: '6TA', elo: 1500, isProvisional: false, changes: [], results: [] }
            : null,
        ),
      },
      tournamentEntry: {
        findMany: jest.fn(async ({ where }: any) =>
          where.userId === 'u1'
            ? [
                {
                  id: 'e1',
                  status: 'ACCEPTED',
                  teamName: 'Fran / Ale',
                  createdAt: new Date('2026-11-01'),
                  tournament: {
                    id: 't1',
                    name: 'Apertura Pádel',
                    sport: 'padel',
                    category: '6TA',
                    status: 'PUBLISHED',
                    startDate: '2026-12-01',
                    endDate: '2026-12-02',
                    club: { id: 'c1', name: 'Club La Trinidad' },
                  },
                },
              ]
            : [],
        ),
      },
    };
    return new PadelRankingService(prisma);
  };

  it('trae mi ficha de ranking por usuario, sin requerir club', async () => {
    const svc = mk();
    const profile = await svc.myProfile('uid-1');
    expect(profile).toMatchObject({ displayName: 'Fran', category: '6TA' });
  });

  it('trae mis torneos de cualquier club, por usuario', async () => {
    const svc = mk();
    const tournaments = await svc.myTournaments('uid-1');
    expect(tournaments).toHaveLength(1);
    expect(tournaments[0].tournament.club.name).toBe('Club La Trinidad');
    expect(tournaments[0].status).toBe('ACCEPTED');
  });

  it('atleta sin ficha ni inscripciones: listas vacías, no error', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn(async () => ({ id: 'u2', name: 'Nueva' })) },
      padelProfile: { findUnique: jest.fn(async () => null) },
      tournamentEntry: { findMany: jest.fn(async () => []) },
    };
    const svc = new PadelRankingService(prisma);
    await expect(svc.myProfile('uid-2')).resolves.toBeNull();
    await expect(svc.myTournaments('uid-2')).resolves.toEqual([]);
  });
});
