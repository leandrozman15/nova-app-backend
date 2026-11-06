import { isValidEvent, personalBests, rankResults, validSplits } from './swim-rules';

describe('swim-rules', () => {
  it('valida combinaciones de estilo y distancia', () => {
    expect(isValidEvent('freestyle', 1500)).toBe(true);
    expect(isValidEvent('butterfly', 400)).toBe(false);
    expect(isValidEvent('medley', 100)).toBe(true);
    expect(isValidEvent('crawl', 100)).toBe(false);
  });

  it('rankea por tiempo, con empates y sin contar descalificados', () => {
    const r = rankResults([
      { id: 'a', timeMs: 61000, status: 'ok' },
      { id: 'b', timeMs: 59500, status: 'ok' },
      { id: 'c', timeMs: 0, status: 'dq' },
      { id: 'd', timeMs: 61000, status: 'ok' },
      { id: 'e', timeMs: 70000, status: 'ok' },
    ]);
    const place = Object.fromEntries(r.map((x) => [x.id, x.place]));
    expect(place).toEqual({ a: 2, b: 1, c: null, d: 2, e: 4 });
  });

  it('calcula la mejor marca sin mezclar pileta de 25 y de 50', () => {
    const d = new Date('2026-11-01');
    const base = { playerId: 'p1', stroke: 'freestyle', distance: 100, status: 'ok', recordedAt: d };
    const pbs = personalBests([
      { ...base, poolLength: 25, timeMs: 65000 },
      { ...base, poolLength: 25, timeMs: 63000 },
      { ...base, poolLength: 50, timeMs: 66000 },
      { ...base, poolLength: 25, timeMs: 50000, status: 'dq' },
    ]);
    expect(pbs).toHaveLength(2);
    expect(pbs.find((p) => p.poolLength === 25)?.timeMs).toBe(63000);
    expect(pbs.find((p) => p.poolLength === 50)?.timeMs).toBe(66000);
  });

  it('valida parciales crecientes y dentro del tiempo final', () => {
    expect(validSplits([30000, 61000], 61000)).toBe(true);
    expect(validSplits([30000, 20000], 61000)).toBe(false);
    expect(validSplits([30000, 70000], 61000)).toBe(false);
    expect(validSplits([], 0)).toBe(true);
  });
});
