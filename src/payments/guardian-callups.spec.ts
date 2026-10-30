import { loadChildCallups } from './guardian-callups';

describe('loadChildCallups', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');

  it('junta las citaciones publicadas de liga y de fixture, ordenadas por fecha', async () => {
    const prisma: any = {
      matchCallup: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1', playerExternalId: 'p1', matchId: 'm1', status: 'pending',
            match: { scheduledAt: new Date('2026-11-08T18:00:00Z'), label: null, venue: 'Cancha 2', busDepartureTime: '16:00', jersey: 'titular', homeTeam: { name: 'Mi club' }, awayTeam: { name: 'Rival' } },
          },
        ]),
      },
      storeDocument: {
        findMany: jest.fn().mockResolvedValue([
          { docId: 'e1_p1', data: { published: true, playerId: 'p1', matchId: 'e1', status: 'confirmed', eventDate: '2026-11-05T17:30', eventOpponent: 'Otro', eventLocation: 'Sede' } },
          { docId: 'e2_p1', data: { published: false, playerId: 'p1', eventDate: '2026-11-06T17:30' } },
          { docId: 'e0_p1', data: { published: true, playerId: 'p1', eventDate: '2026-10-01T17:30' } },
        ]),
      },
    };
    const r = await loadChildCallups(prisma, [{ id: 'p1', companyId: 'co' }], now);
    const list = r.get('p1')!;
    expect(list.map((c) => c.id)).toEqual(['fx:e1_p1', 'lg:c1']);
    expect(list[0]).toMatchObject({ source: 'club', status: 'confirmed', awayName: 'Otro', location: 'Sede' });
    expect(list[1]).toMatchObject({ source: 'league', homeName: 'Mi club', departureTime: '16:00', jersey: 'titular' });
  });
});
