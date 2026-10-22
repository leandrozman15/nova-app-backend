import { roundRobin } from './league-fixture.service';

describe('roundRobin', () => {
  it.each([3, 4, 5, 6, 7])('genera todos los cruces una vez y nadie juega dos veces por jornada (%i equipos)', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const fixture = roundRobin(ids, 1);
    const pairs = new Set(fixture.map((m) => [m.home, m.away].sort().join('-')));
    expect(fixture).toHaveLength((n * (n - 1)) / 2);
    expect(pairs.size).toBe((n * (n - 1)) / 2);

    const byRound = new Map<number, string[]>();
    fixture.forEach((m) => byRound.set(m.round, [...(byRound.get(m.round) ?? []), m.home, m.away]));
    byRound.forEach((teams) => expect(new Set(teams).size).toBe(teams.length));
  });

  it('ida y vuelta duplica los partidos e invierte la localía', () => {
    const fixture = roundRobin(['a', 'b', 'c', 'd'], 2);
    expect(fixture).toHaveLength(12);
    const first = fixture.find((m) => m.round === 1)!;
    expect(fixture.find((m) => m.round === 4 && m.home === first.away && m.away === first.home)).toBeDefined();
  });
});
