import { buildScorers, parseStatsPath } from './club-scorers';

const P = (d: string, t: string, e: string) => `clubs/c/divisions/${d}/teams/${t}/events/${e}/stats`;

describe('club-scorers', () => {
  it('parseStatsPath reconoce solo estadísticas de partido', () => {
    expect(parseStatsPath(P('d1', 't1', 'e1'))).toEqual({ divisionId: 'd1', teamId: 't1', eventId: 'e1' });
    expect(parseStatsPath('clubs/c/divisions/d1/teams/t1/assignments')).toBeNull();
  });

  it('arma una tabla por categoría (equipo), solo con sus jugadores y puestos propios', () => {
    const rows = [
      { parentPath: P('d1', 't19', 'e1'), data: { playerId: 'a', playerName: 'Ana', goals: 2, minutesPlayed: 30 } },
      { parentPath: P('d1', 't19', 'e2'), data: { playerId: 'a', playerName: 'Ana', goals: 1, yellowCards: 1, minutesPlayed: 20 } },
      { parentPath: P('d1', 't19', 'e1'), data: { playerId: 'b', playerName: 'Beto', trys: 1, minutesPlayed: 40 } },
      { parentPath: P('d1', 't16', 'e5'), data: { playerId: 'z', playerName: 'Zoe', goals: 9, minutesPlayed: 10 } },
      { parentPath: P('d1', 't16', 'e5'), data: { playerId: 'c', playerName: 'Cami', goals: 0, minutesPlayed: 40 } },
    ];
    const names = new Map([['t19', '2019'], ['t16', '2016']]);
    const all = buildScorers(rows, {}, new Map([['d1', 'Infantil']]), names);
    expect(all.map((r) => [r.teamName, r.playerName, r.position])).toEqual([
      ['2016', 'Zoe', 1],
      ['2019', 'Ana', 1],
      ['2019', 'Beto', 2],
    ]);
    expect(all[1]).toMatchObject({ matches: 2, yellowCards: 1, divisionName: 'Infantil', total: 3 });
    expect(buildScorers(rows, { teamId: 't19' }, new Map(), names).map((r) => r.playerName)).toEqual(['Ana', 'Beto']);
    expect(buildScorers(rows, { teamIds: ['t16'] }, new Map(), names).map((r) => r.playerName)).toEqual(['Zoe']);
  });
});
