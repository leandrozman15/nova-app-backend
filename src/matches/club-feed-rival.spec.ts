import { buildRivalCards, buildTable, norm, standingOf } from './club-feed-rival';

describe('tabla del rival', () => {
  const played = (h: string, a: string, hs: number, as: number) => ({ homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, status: 'played' });

  it('ordena por puntos, diferencia y goles, e incluye equipos sin partidos jugados', () => {
    const table = buildTable([
      played('A', 'B', 2, 0),
      played('C', 'A', 1, 1),
      { homeTeamId: 'D', awayTeamId: 'B', homeScore: 0, awayScore: 0, status: 'scheduled' },
    ]);
    expect(table.map((r) => r.teamId)).toEqual(['A', 'C', 'D', 'B']);
    expect(standingOf(table, 'A')).toMatchObject({ position: 1, total: 4, points: 4, played: 2, won: 1, drawn: 1 });
    expect(standingOf(table, 'D')).toMatchObject({ position: 3, played: 0 });
    expect(standingOf(table, 'X')).toBeNull();
  });

  it('normaliza nombres sin tildes ni signos', () => {
    expect(norm('  Lomas Athletic-Club ')).toBe('lomas athletic club');
    expect(norm('Estudiantes Río Cuarto')).toBe('estudiantes rio cuarto');
  });
});

describe('buildRivalCards', () => {
  const team = (id: string, name: string, clubId: string) => ({ id, name, clubId });
  const match = { id: 'm1', venue: 'Cancha 1', homeTeam: team('t2', 'Lomas', 'c2'), awayTeam: team('t1', 'Mi club', 'c1'), tournament: { id: 'tor', name: 'Apertura' } };

  it('arma la ficha del rival con la carga de "Clubes rivales" por encima del club y la posición', async () => {
    const prisma = {
      club: { findMany: jest.fn().mockResolvedValue([{ id: 'c2', name: 'Lomas Athletic Club', logoUrl: 'club.png', coverUrl: null, address: 'Vieja 1', city: 'Lomas', latitude: null, longitude: null }]) },
      storeDocument: { findMany: jest.fn().mockResolvedValue([{ data: { name: 'Lomas Athletic', address: 'Calle 9 1234', coverUrl: 'portada.jpg' } }]) },
      match: { findMany: jest.fn().mockResolvedValue([{ tournamentId: 'tor', homeTeamId: 't2', awayTeamId: 't1', homeScore: 3, awayScore: 0, status: 'played' }]) },
    };
    const cards = await buildRivalCards(prisma as never, 'c1', [match]);
    const card = cards.get('m1')!;
    expect(card.rival).toMatchObject({ teamId: 't2', name: 'Lomas Athletic', logoUrl: 'club.png', coverUrl: 'portada.jpg', address: 'Calle 9 1234', standing: { position: 1, total: 2, points: 3 } });
    expect(card.place).toMatchObject({ name: 'Lomas Athletic', venue: 'Cancha 1' });
  });

  it('sin partidos no consulta nada', async () => {
    const prisma = { club: { findMany: jest.fn() }, storeDocument: { findMany: jest.fn() }, match: { findMany: jest.fn() } };
    expect((await buildRivalCards(prisma as never, 'c1', [])).size).toBe(0);
    expect(prisma.club.findMany).not.toHaveBeenCalled();
  });
});
