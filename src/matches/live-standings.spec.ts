import { liveTable } from './live-standings';

const rows = [
  {
    teamName: 'Atlético Ejemplo Sur',
    teamId: 'o1',
    points: 9,
    goalsFor: 8,
    goalsAgainst: 2,
    played: 3,
  },
  {
    teamName: 'Club La Trinidad',
    teamId: 'club1',
    isInternal: true,
    points: 7,
    goalsFor: 6,
    goalsAgainst: 3,
    played: 3,
  },
  {
    teamName: 'Deportivo Demo Norte',
    teamId: 'o2',
    points: 7,
    goalsFor: 5,
    goalsAgainst: 4,
    played: 3,
  },
  { teamName: 'Unión Demo Oeste', teamId: 'o3', points: 3, played: 3 },
  { teamName: 'Club Social Prueba', teamId: 'o4', points: 1, played: 3 },
  { teamName: 'Sportivo Ficticio', teamId: 'o5', points: 0, played: 3 },
];

describe('liveTable', () => {
  it('ordena y marca las posiciones de los dos equipos', () => {
    const t = liveTable(rows, {
      clubId: 'club1',
      awayName: 'Sportivo Ficticio',
      name: 'Liga',
      limit: 3,
    })!;
    expect(t.homePosition).toBe(2);
    expect(t.awayPosition).toBe(6);
    expect(t.rows.map((r) => r.name)).toEqual([
      'Atlético Ejemplo Sur',
      'Club La Trinidad',
      'Deportivo Demo Norte',
      'Sportivo Ficticio',
    ]);
    expect(t.rows[1].side).toBe('home');
  });

  it('desempata por diferencia de gol', () => {
    const t = liveTable(rows, { clubId: 'club1', awayName: 'x' })!;
    expect(t.rows[1].name).toBe('Club La Trinidad');
    expect(t.rows[2].name).toBe('Deportivo Demo Norte');
  });

  it('sin tabla no devuelve nada', () => {
    expect(liveTable([], { clubId: 'c', awayName: 'x' })).toBeNull();
  });
});
