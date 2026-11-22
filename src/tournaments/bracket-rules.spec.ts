import {
  advance,
  bracketSize,
  buildBracket,
  nextSlot,
  roundName,
  scheduleText,
  seedOrder,
  teamLabel,
} from './bracket-rules';

describe('bracket rules', () => {
  it('tamaño del cuadro: próxima potencia de 2', () => {
    expect(bracketSize(2)).toBe(2);
    expect(bracketSize(5)).toBe(8);
    expect(bracketSize(8)).toBe(8);
    expect(bracketSize(9)).toBe(16);
  });

  it('siembra clásica: 1 contra el último', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('con 6 parejas los dos mejores pasan directo a semis', () => {
    const ids = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const all = buildBracket(ids);
    const r1 = all.filter((m) => m.round === 1);
    expect(r1).toHaveLength(4);
    expect(r1[0]).toMatchObject({ teamAId: 's1', teamBId: null, winnerId: 's1' });
    expect(r1[1]).toMatchObject({ teamAId: 's4', teamBId: 's5', winnerId: null });
    expect(r1[2]).toMatchObject({ teamAId: 's2', teamBId: null, winnerId: 's2' });
    const semis = all.filter((m) => m.round === 2);
    expect(semis[0]).toMatchObject({ teamAId: 's1', teamBId: null });
    expect(semis[1]).toMatchObject({ teamAId: 's2', teamBId: null });
    expect(all.filter((m) => m.round === 3)).toHaveLength(1);
  });

  it('cada pareja aparece una sola vez en la primera ronda', () => {
    const ids = Array.from({ length: 13 }, (_, i) => `t${i}`);
    const r1 = buildBracket(ids).filter((m) => m.round === 1);
    const seen = r1.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean);
    expect(new Set(seen).size).toBe(13);
    expect(r1.every((m) => m.teamAId || m.teamBId)).toBe(true);
  });

  it('el ganador pasa al lado correcto del partido siguiente', () => {
    expect(nextSlot(1, 0)).toEqual({ round: 2, position: 0, side: 'A' });
    expect(nextSlot(1, 3)).toEqual({ round: 2, position: 1, side: 'B' });
    const all = buildBracket(['a', 'b', 'c', 'd']);
    advance(all, { round: 1, position: 1 }, 'c');
    expect(all.find((m) => m.round === 2)?.teamBId).toBe('c');
  });

  it('nombres de ronda', () => {
    expect(roundName(3, 3)).toBe('Final');
    expect(roundName(2, 3)).toBe('Semifinal');
    expect(roundName(1, 3)).toBe('Cuartos de final');
    expect(roundName(1, 4)).toBe('Octavos de final');
    expect(roundName(1, 5)).toBe('16avos de final');
  });

  it('textos', () => {
    expect(teamLabel([{ name: ' Pérez ' }, { name: 'Gómez' }])).toBe('Pérez / Gómez');
    expect(scheduleText({ date: '2026-11-28', startMinute: 18 * 60 + 30, court: 'Cancha 2' })).toBe(
      'sáb 28/11 18:30 · Cancha 2',
    );
    expect(scheduleText({ date: null, startMinute: null, court: null })).toBe('a confirmar');
  });
});
