import { incidentsOf, loadClubLive } from './club-live';

describe('guardian-live', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');

  it('incidentsOf ordena por minuto y descarta tipos desconocidos', () => {
    const r = incidentsOf([
      { type: 'yellow', playerName: 'B', minute: 30, side: 'away' },
      { type: 'goal', playerName: 'A', minute: 5 },
      { type: 'substitution', minute: 1 },
    ]);
    expect(r.map((x) => x.playerName)).toEqual(['A', 'B']);
    expect(r[0].side).toBe('home');
    expect(r[1].side).toBe('away');
  });

  it('arma el live del entrenador con escudos e incidencias y ignora los viejos', async () => {
    const prisma: any = {
      storeDocument: {
        findMany: jest.fn().mockResolvedValue([
          { docId: 'c_t_live', data: { status: 'live', teamName: 'Cat 2019', teamId: 't19', divisionId: 'd1', opponentName: 'Rival', clubLogo: 'a.png', opponentLogo: 'b.png', homeScore: 2, awayScore: 1, matchPhase: 'entretiempo', timeDisplay: '23:10', updatedAt: '2026-11-01T11:59:00Z', incidents: [{ type: 'goal', playerName: 'Juan', minute: 4 }] } },
          { docId: 'old', data: { status: 'live', updatedAt: '2026-10-30T11:59:00Z' } },
          { docId: 'fin', data: { status: 'finished' } },
        ]),
      },
      match: { findMany: jest.fn().mockResolvedValue([]) },
      club: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const r = await loadClubLive(prisma, 'co', 'c', now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ teamId: 't19', divisionId: 'd1', homeName: 'Cat 2019', homeLogo: 'a.png', awayLogo: 'b.png', homeScore: 2, phase: 'entretiempo' });
    expect(r[0].incidents[0]).toMatchObject({ type: 'goal', playerName: 'Juan', minute: 4, side: 'home' });
  });

  it('liga en vivo: goles y tarjetas con jugador, gol en contra suma al otro lado', async () => {
    const prisma: any = {
      storeDocument: { findMany: jest.fn().mockResolvedValue([]) },
      club: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', logoUrl: 'l1.png' }]) },
      match: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'm1', homeScore: 1, awayScore: 0, homeTeamId: 'th',
            homeTeam: { name: 'Local', clubId: 'c1' }, awayTeam: { name: 'Visita', clubId: null },
            events: [
              { type: 'goal', minute: 10, teamId: 'th', player: { firstName: 'Ana', lastName: 'Paz' } },
              { type: 'own_goal', minute: 20, teamId: 'ta', player: null },
              { type: 'red_card', minute: 30, teamId: 'ta', player: { firstName: 'Lu', lastName: 'Gil' } },
            ],
          },
        ]),
      },
    };
    const [m] = await loadClubLive(prisma, 'co', 'c1', now);
    expect(m.homeLogo).toBe('l1.png');
    expect(m.awayLogo).toBeNull();
    expect(m.incidents.map((i) => [i.type, i.side, i.playerName])).toEqual([
      ['goal', 'home', 'Ana Paz'],
      ['goal', 'home', null],
      ['red', 'away', 'Lu Gil'],
    ]);
  });

  it('completa escudos desde los clubes si el Live no los trajo', async () => {
    const prisma: any = {
      storeDocument: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.parentPath ? [{ data: { name: 'Otro', logoUrl: 'o.png' } }] : [{ docId: 'x', data: { status: 'live', teamName: 'Cat', opponentName: 'Rival FC', homeScore: 0, awayScore: 0, updatedAt: '2026-11-01T11:59:00Z' } }])) },
      match: { findMany: jest.fn().mockResolvedValue([]) },
      club: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.id === 'c' ? [{ id: 'c', logoUrl: 'own.png' }] : [{ name: 'Rival FC', logoUrl: 'rival.png' }]),
        ),
      },
    };
    const r = await loadClubLive(prisma, 'co', 'c', now);
    expect(r[0]).toMatchObject({ homeLogo: 'own.png', awayLogo: 'rival.png' });
  });

  it('el escudo del rival sale de los rivales cargados del club', async () => {
    const prisma: any = {
      storeDocument: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.parentPath ? [{ data: { name: 'Club Visitante', logoUrl: 'vis.png' } }] : [{ docId: 'x', data: { status: 'live', teamName: 'Cat', opponentName: 'Club Visitante · Div. A', updatedAt: '2026-11-01T11:59:00Z' } }]),
        ),
      },
      match: { findMany: jest.fn().mockResolvedValue([]) },
      club: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const r = await loadClubLive(prisma, 'co', 'c', now);
    expect(r[0].awayLogo).toBe('vis.png');
  });

  it('partido de liga con transmisión del entrenador: la tarjeta lleva marcador, reloj, tiempo e incidencias reales', async () => {
    const prisma: any = {
      storeDocument: {
        findMany: jest.fn().mockResolvedValue([
          { docId: 'c1_t1_live', data: { status: 'live', clubId: 'c1', teamId: 't1', teamName: 'Cat 2019', opponentName: 'Visita', backendMatchId: 'm1', homeScore: 2, awayScore: 0, timeDisplay: '12:30', period: 1, totalPeriods: 2, matchPhase: 'en_curso', updatedAt: '2026-11-01T11:59:00Z', incidents: [{ type: 'goal', playerName: 'Ana', minute: 5, side: 'home' }] } },
        ]),
      },
      club: { findMany: jest.fn().mockResolvedValue([]) },
      match: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', homeScore: 0, awayScore: 0, homeTeamId: 'th', homeTeam: { name: 'Local', clubId: 'c1' }, awayTeam: { name: 'Visita', clubId: 'c2' }, events: [{ type: 'goal', minute: 5, teamId: 'th', player: null }] },
          { id: 'm2', homeScore: 0, awayScore: 0, homeTeamId: 'th', homeTeam: { name: 'Otro', clubId: 'c1' }, awayTeam: { name: 'Otra visita', clubId: null }, events: [] },
        ]),
      },
    };
    const r = await loadClubLive(prisma, 'co', 'c1', now);
    expect(r.map((x) => x.id)).toEqual(['lg:m1', 'lg:m2']);
    expect(r[0]).toMatchObject({ homeScore: 2, awayScore: 0, timeDisplay: '12:30', period: 1, totalPeriods: 2, phase: 'en_curso' });
    expect(r[0].incidents[0]).toMatchObject({ playerName: 'Ana', minute: 5, side: 'home' });
    expect(r[1]).toMatchObject({ homeScore: 0, timeDisplay: null });
  });

  it('si el que transmite es el visitante de la liga, se invierten marcador e incidencias', async () => {
    const prisma: any = {
      storeDocument: {
        findMany: jest.fn().mockResolvedValue([
          { docId: 'c2_t1_live', data: { status: 'live', clubId: 'c2', mineHome: false, backendMatchId: 'm1', homeScore: 3, awayScore: 1, timeDisplay: '40:00', updatedAt: '2026-11-01T11:59:00Z', incidents: [{ type: 'goal', playerName: 'Luz', minute: 8, side: 'home' }] } },
        ]),
      },
      club: { findMany: jest.fn().mockResolvedValue([]) },
      match: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', homeScore: 0, awayScore: 0, homeTeamId: 'th', homeTeam: { name: 'Local', clubId: 'c1' }, awayTeam: { name: 'Visita', clubId: 'c2' }, events: [] },
        ]),
      },
    };
    const [m] = await loadClubLive(prisma, 'co', 'c1', now);
    expect(m).toMatchObject({ homeScore: 1, awayScore: 3, timeDisplay: '40:00' });
    expect(m.incidents[0].side).toBe('away');
  });
});
