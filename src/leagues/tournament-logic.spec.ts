import { bracketOrder, buildTable, firstRoundPairs, KoMatch, nextPow2, planNextRound, splitGroups } from './tournament-logic';

const seedsOf = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

/** Juega la llave completa: siempre gana el de mejor semilla (menor número). */
function simulate(n: number) {
  const seeds = seedsOf(n);
  const rank = (id: string) => Number(id.slice(1));
  let matches: KoMatch[] = firstRoundPairs(seeds)
    .filter((p) => p.away)
    .map((p) => ({ slot: p.slot, home: p.home, away: p.away as string, played: false, homeScore: 0, awayScore: 0 }));
  let round = 1;
  const played: string[][] = [];
  for (let guard = 0; guard < 10; guard++) {
    matches = matches.map((m) => {
      const homeWins = rank(m.home) < rank(m.away);
      return { ...m, played: true, homeScore: homeWins ? 1 : 0, awayScore: homeWins ? 0 : 1 };
    });
    played.push(matches.flatMap((m) => [m.home, m.away]));
    const plan = planNextRound(seeds, round, matches);
    if (plan.finished) return { champion: plan.champion, rounds: round, played };
    matches = plan.pairs.map((p) => ({ ...p, played: false, homeScore: 0, awayScore: 0 }));
    round++;
  }
  throw new Error('no termina');
}

describe('llaves de eliminación', () => {
  it('bracketOrder cruza 1 con el último y separa a los mejores', () => {
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 12, 16])('con %i equipos termina con campeón y la cantidad de rondas correcta', (n) => {
    const { champion, rounds, played } = simulate(n);
    expect(champion).toBe('s1');
    expect(rounds).toBe(Math.log2(nextPow2(n)));
    // nadie juega dos veces en la misma ronda
    played.forEach((teams) => expect(new Set(teams).size).toBe(teams.length));
  });

  it('los mejores sembrados pasan directo cuando sobran lugares (bye)', () => {
    const pairs = firstRoundPairs(seedsOf(6));
    expect(pairs.filter((p) => !p.away).map((p) => p.home).sort()).toEqual(['s1', 's2']);
  });

  it('un empate sin penales no deja avanzar; con penales sí', () => {
    const seeds = seedsOf(2);
    const tied: KoMatch = { slot: 0, home: 's1', away: 's2', played: true, homeScore: 1, awayScore: 1 };
    expect(() => planNextRound(seeds, 1, [tied])).toThrow();
    const plan = planNextRound(seeds, 1, [{ ...tied, homePens: 3, awayPens: 5 }]);
    expect(plan).toEqual({ finished: true, champion: 's2' });
  });

  it('con 4 equipos genera tercer puesto entre los perdedores de semifinales', () => {
    const seeds = seedsOf(4);
    const semis: KoMatch[] = firstRoundPairs(seeds).map((p) => ({
      slot: p.slot, home: p.home, away: p.away as string, played: true, homeScore: 2, awayScore: 0,
    }));
    const plan = planNextRound(seeds, 1, semis);
    expect(plan.finished).toBe(false);
    if (!plan.finished) {
      expect(plan.label).toBe('Final');
      expect(plan.thirdPlace && [plan.thirdPlace.home, plan.thirdPlace.away].sort()).toEqual(['s3', 's4']);
    }
  });
});

describe('grupos y tabla', () => {
  it('reparte por cabezas de serie', () => {
    expect(splitGroups(['a', 'b', 'c', 'd', 'e', 'f'], 3)).toEqual([['a', 'd'], ['b', 'e'], ['c', 'f']]);
  });

  it('ordena por puntos, diferencia y goles', () => {
    const table = buildTable(
      [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      [
        { homeTeamId: 'a', awayTeamId: 'b', homeScore: 2, awayScore: 0 },
        { homeTeamId: 'b', awayTeamId: 'c', homeScore: 1, awayScore: 1 },
        { homeTeamId: 'c', awayTeamId: 'a', homeScore: 0, awayScore: 3 },
      ],
    );
    expect(table.map((r) => [r.teamId, r.points])).toEqual([['a', 6], ['b', 1], ['c', 1]]);
  });
});
