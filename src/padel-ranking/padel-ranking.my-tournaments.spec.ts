import { PadelRankingService } from './padel-ranking.service';

/** "Mi pádel" para un atleta sin club: su ficha de ranking (con historial de ELO) y sus torneos, por usuario. */
describe('mi perfil y mis torneos (sin club)', () => {
  const mk = () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn(async () => ({ id: 'u1', name: 'Fran' })),
      },
      padelProfile: {
        findUnique: jest.fn(async ({ where, select }: any) => {
          if (where.userId !== 'u1') return null;
          if (select?.eloHistory) {
            return {
              id: 'p1',
              displayName: 'Fran',
              category: '6TA',
              elo: 1500,
              isProvisional: false,
              changes: [],
              results: [],
              eloHistory: [
                { elo: 1520, reason: 'win', tournamentId: 't1', createdAt: new Date('2026-11-10') },
                { elo: 1400, reason: 'declared', tournamentId: null, createdAt: new Date('2026-01-01') },
              ],
            };
          }
          return { id: 'p1', dniHash: 'hash-fran' };
        }),
      },
      clubPadelMember: { findMany: jest.fn(async () => []) },
      player: { findMany: jest.fn(async () => []) },
      tournamentTeam: { findMany: jest.fn(async () => []) },
      tournamentMatch: { findMany: jest.fn(async () => []) },
      tournamentEntry: {
        findMany: jest.fn(async ({ where }: any) =>
          where.OR?.some((c: any) => c.userId === 'u1')
            ? [
                {
                  id: 'e1',
                  status: 'ACCEPTED',
                  teamName: 'Fran / Ale',
                  createdAt: new Date('2026-11-01'),
                  tournamentId: 't1',
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

  it('trae mi ficha de ranking por usuario, con el historial de ELO en orden cronológico', async () => {
    const svc = mk();
    const profile = await svc.myProfile('uid-1');
    expect(profile).toMatchObject({ displayName: 'Fran', category: '6TA' });
    expect(profile!.eloHistory.map((h) => h.elo)).toEqual([1400, 1520]);
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

  it('alumno de pádel cargado directo al cuadro por el club (sin inscripción de la app): también aparece, con su puesto', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn(async () => ({ id: 'u3', name: 'Male' })) },
      padelProfile: { findUnique: jest.fn(async () => ({ id: 'p3', dniHash: 'hash-male' })) },
      clubPadelMember: { findMany: jest.fn(async () => [{ clubId: 'c2' }]) },
      player: { findMany: jest.fn(async () => [{ id: 'player-male', clubId: 'c2' }]) },
      tournamentEntry: { findMany: jest.fn(async () => []) },
      tournamentTeam: {
        findMany: jest.fn(async () => [
          {
            id: 'team-male',
            entryId: null,
            players: [{ name: 'Male', playerId: 'player-male' }, { name: 'Compañera' }],
            tournamentId: 't2',
            tournament: {
              id: 't2',
              name: 'Torneo de alumnos',
              sport: 'padel',
              category: '7MA',
              status: 'FINISHED',
              startDate: '2026-10-15',
              endDate: '2026-10-16',
              club: { id: 'c2', name: 'Club Norte' },
            },
          },
        ]),
      },
      tournamentMatch: {
        findMany: jest.fn(async () => [
          { tournamentId: 't2', round: 1, teamAId: 'team-male', teamBId: 'team-x', winnerId: 'team-male', date: '2026-10-15' },
          { tournamentId: 't2', round: 2, teamAId: 'team-male', teamBId: 'team-y', winnerId: 'team-y', date: '2026-10-16' },
        ]),
      },
    };
    const svc = new PadelRankingService(prisma);
    const tournaments = await svc.myTournaments('uid-3');
    expect(tournaments).toHaveLength(1);
    expect(tournaments[0].tournament.club.name).toBe('Club Norte');
    // Perdió en la ronda 2 de un cuadro de 2 rondas: esa es la final → subcampeón/a.
    expect(tournaments[0].placement).toBe('Subcampeón/a');
    expect(tournaments[0].champion).toBe(false);
    expect(tournaments[0].date).toBe('2026-10-16');
  });
});
