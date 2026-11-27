import {
  applyLoss, canLower, categoryOfElo, checkPlayers, eloDelta, oneUp, shouldPromote, startingElo,
} from './padel-categories';

describe('categorías de pádel', () => {
  it('ubica el ELO en su categoría', () => {
    expect(categoryOfElo(999)).toBe('8VA');
    expect(categoryOfElo(1000)).toBe('7MA');
    expect(categoryOfElo(1749)).toBe('5TA');
    expect(categoryOfElo(3000)).toBe('1RA');
    expect(startingElo('6TA')).toBe(1250);
    expect(oneUp('7MA')).toBe('6TA');
    expect(oneUp('1RA')).toBe('1RA');
  });

  it('torneo por categoría: se puede jugar para arriba, no para abajo', () => {
    const rules = { mode: 'category' as const, category: '7MA' };
    expect(checkPlayers(rules, [{ name: 'A', category: '7MA' }, { name: 'B', category: '8VA' }]).ok).toBe(true);
    const r = checkPlayers(rules, [{ name: 'Fran', category: '5TA' }, { name: 'B', category: '7MA' }]);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain('Fran');
  });

  it('suma 11: 5ta + 6ta entra; 4ta + 6ta no; el tope frena a la 1ra con una 8va', () => {
    const rules = { mode: 'suma' as const, sum: 11, top: '4TA' };
    expect(checkPlayers(rules, [{ name: 'A', category: '5TA' }, { name: 'B', category: '6TA' }]).ok).toBe(true);
    expect(checkPlayers(rules, [{ name: 'A', category: '4TA' }, { name: 'B', category: '6TA' }]).ok).toBe(false);
    const cheat = checkPlayers(rules, [{ name: 'Pro', category: '1RA' }, { name: 'Nuevo', category: '8VA' }]);
    expect(cheat.ok).toBe(false);
    expect(cheat.reasons.join(' ')).toContain('tope');
  });

  it('sin reglas no controla nada', () => {
    expect(checkPlayers({ mode: null }, [{ name: 'A', category: '1RA' }]).ok).toBe(true);
  });

  it('ELO: ganarle a uno más fuerte suma más y perder no baja del piso', () => {
    expect(eloDelta(1300, 1700)).toBeGreaterThan(eloDelta(1500, 1500));
    expect(eloDelta(1300, 1700)).toBeGreaterThanOrEqual(35);
    expect(applyLoss(1260, 30, '6TA')).toBe(1250);
    expect(applyLoss(1300, 20, '6TA')).toBe(1280);
  });

  it('ascenso: campeón con 12 parejas o dos finales en 60 días', () => {
    expect(shouldPromote({ kind: 'champion', teamsCount: 12, finalsInWindow: 1 })).toBe('champion');
    expect(shouldPromote({ kind: 'champion', teamsCount: 8, finalsInWindow: 1 })).toBeNull();
    expect(shouldPromote({ kind: 'finalist', teamsCount: 8, finalsInWindow: 2 })).toBe('two_finals');
  });

  it('bajar de categoría: bloqueado 6 meses salvo provisional o lesión/inactividad', () => {
    const recent = new Date('2026-10-01');
    const now = new Date('2026-11-27');
    expect(canLower({ isProvisional: false, lastChangeAt: recent, now })).toBe(false);
    expect(canLower({ isProvisional: false, lastChangeAt: recent, reason: 'lesion', now })).toBe(true);
    expect(canLower({ isProvisional: true, lastChangeAt: recent, now })).toBe(true);
    expect(canLower({ isProvisional: false, lastChangeAt: new Date('2026-01-01'), now })).toBe(true);
  });
});
