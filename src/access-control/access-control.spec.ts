import { evaluateAccess } from './access-verdict';
import { signAccessToken, verifyAccessToken } from './access-token';

const KEY = 'test-key';
const T0 = Date.UTC(2026, 10, 27, 15, 0, 0);

describe('token de fichaje', () => {
  it('acepta el QR vigente y rechaza el vencido', () => {
    const t = signAccessToken('p1', KEY, T0);
    expect(verifyAccessToken(t, KEY, T0 + 5_000)).toEqual({ ok: true, playerId: 'p1' });
    expect(verifyAccessToken(t, KEY, T0 + 45_000).ok).toBe(true);
    expect(verifyAccessToken(t, KEY, T0 + 120_000)).toEqual({ ok: false, reason: 'expired' });
  });
  it('rechaza firmas adulteradas y otro atleta', () => {
    const t = signAccessToken('p1', KEY, T0);
    expect(verifyAccessToken(t.replace('p1', 'p2'), KEY, T0)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyAccessToken(t, 'otra', T0)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyAccessToken('basura', KEY, T0)).toEqual({ ok: false, reason: 'format' });
  });
});

const base = {
  active: true,
  fees: [] as any[],
  lateFee: { mode: 'off' as const, percent: 0, graceDays: 0, maxPercent: null },
  medical: 'ok' as const,
  now: new Date('2026-11-27T15:00:00Z'),
  today: '2026-11-27',
};

describe('semáforo', () => {
  it('verde con todo al día', () => {
    expect(evaluateAccess(base).result).toBe('green');
  });
  it('rojo con cuota vencida y muestra el monto con mora', () => {
    const r = evaluateAccess({
      ...base,
      lateFee: { mode: 'fixed', percent: 10, graceDays: 0, maxPercent: null },
      fees: [{ amount: 25000, month: 10, year: 2026, dueDate: '2026-10-31' }],
    });
    expect(r.result).toBe('red');
    expect(r.owed).toBe(27500);
    expect(r.reasons[0].message).toContain('octubre 2026');
  });
  it('amarillo si vence en 48 h y no bloquea', () => {
    const r = evaluateAccess({
      ...base,
      fees: [{ amount: 25000, month: 11, year: 2026, dueDate: '2026-11-29' }],
    });
    expect(r.result).toBe('yellow');
  });
  it('apto: vencido rojo, por vencer o sin cargar amarillo', () => {
    expect(evaluateAccess({ ...base, medical: 'expired' }).result).toBe('red');
    expect(evaluateAccess({ ...base, medical: 'soon' }).result).toBe('yellow');
    expect(evaluateAccess({ ...base, medical: 'missing' }).result).toBe('yellow');
  });
  it('cuota de un mes futuro no molesta e inactivo es rojo', () => {
    expect(evaluateAccess({ ...base, fees: [{ amount: 1, month: 12, year: 2026, dueDate: '2026-12-31' }] }).result).toBe('green');
    expect(evaluateAccess({ ...base, active: false }).result).toBe('red');
  });
});
