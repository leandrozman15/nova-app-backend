import { buildScorers, parseStatsPath } from './club-scorers';

const P = (d: string, t: string, e: string) => `clubs/c/divisions/${d}/teams/${t}/events/${e}/stats`;

describe('club-scorers', () => {
  it('parseStatsPath reconoce solo estadísticas de partido', () => {
    expect(parseStatsPath(P('d1', 't1', 'e1'))).toEqual({ divisionId: 'd1', teamId: 't1', eventId: 'e1' });
    expect(parseStatsPath('clubs/c/divisions/d1/teams/t1/assignments')).toBeNull();
  });

  it('suma goles y tries por jugador, ordena y cuenta partidos', () => {
    const rows = [
      { parentPath: P('d1', 't1', 'e1'), data: { playerId: 'a', playerName: 'Ana', goals: 2, minutesPlayed: 30 } },
      { parentPath: P('d1', 't1', 'e2'), data: { playerId: 'a', playerName: 'Ana', goals: 1, yellowCards: 1, minutesPlayed: 20 } },
      { parentPath: P('d1', 't1', 'e1'), data: { playerId: 'b', playerName: 'Beto', trys: 4, minutesPlayed: 40 } },
      { parentPath: P('d1', 't1', 'e1'), data: { playerId: 'c', playerName: 'Cami', goals: 0, minutesPlayed: 40 } },
      { parentPath: P('d2', 't2', 'e9'), data: { playerId: 'z', playerName: 'Zoe', goals: 9 } },
    ];
    const all = buildScorers(rows, {}, new Map([['d1', '2019']]));
    expect(all.map((r) => [r.playerName, r.total, r.position])).toEqual([['Zoe', 9, 1], ['Beto', 4, 2], ['Ana', 3, 3]]);
    expect(all[2]).toMatchObject({ matches: 2, yellowCards: 1, divisionName: '2019' });
    const d1 = buildScorers(rows, { divisionId: 'd1' });
    expect(d1.map((r) => r.playerName)).toEqual(['Beto', 'Ana']);
  });
});
