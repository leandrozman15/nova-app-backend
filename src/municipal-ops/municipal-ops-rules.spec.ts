import { canMoveRequest, canSettle, complianceFor, countByMonth, documentStatus, reminderBucket, sortCalendar } from './municipal-ops-rules';

const now = new Date('2026-11-10T12:00:00Z');
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe('municipal-ops-rules', () => {
  it('estado de un documento según su vencimiento', () => {
    expect(documentStatus(null, now)).toBe('no_expiry');
    expect(documentStatus(inDays(-1), now)).toBe('expired');
    expect(documentStatus(inDays(10), now)).toBe('expiring');
    expect(documentStatus(inDays(90), now)).toBe('valid');
  });

  it('cumplimiento: faltantes y vencidos son alerta, por vencer es aviso', () => {
    const all = (e: Date | null) => ['statute', 'legal_status', 'insurance', 'habilitation'].map((kind) => ({ kind, expiresAt: e }));
    expect(complianceFor(all(inDays(200)), now).level).toBe('ok');
    expect(complianceFor(all(null), now).level).toBe('ok');
    expect(complianceFor(all(inDays(5)), now).level).toBe('warning');
    const missing = complianceFor([{ kind: 'statute', expiresAt: null }], now);
    expect(missing.level).toBe('alert');
    expect(missing.missing).toEqual(['legal_status', 'insurance', 'habilitation']);
    const expired = complianceFor([...all(inDays(200)).slice(0, 3), { kind: 'habilitation', expiresAt: inDays(-3) }], now);
    expect(expired.level).toBe('alert');
    expect(expired.expired).toEqual(['habilitation']);
  });

  it('si hay un seguro vencido y otro renovado, cuenta el vigente', () => {
    const docs = [
      { kind: 'statute', expiresAt: null }, { kind: 'legal_status', expiresAt: null }, { kind: 'habilitation', expiresAt: null },
      { kind: 'insurance', expiresAt: inDays(-100) }, { kind: 'insurance', expiresAt: inDays(250) },
    ];
    expect(complianceFor(docs, now).level).toBe('ok');
  });

  it('transiciones de un pedido', () => {
    expect(canMoveRequest('pending', 'approved')).toBe(true);
    expect(canMoveRequest('approved', 'delivered')).toBe(true);
    expect(canMoveRequest('rejected', 'approved')).toBe(false);
    expect(canMoveRequest('pending', 'delivered')).toBe(false);
  });

  it('calendario: ordena y recorta a la ventana', () => {
    const it = (id: string, start: string) => ({ id, type: 'match' as const, title: id, start, end: null, place: null, clubId: null });
    const r = sortCalendar([it('b', '2026-11-12T10:00:00Z'), it('x', '2027-01-01T00:00:00Z'), it('a', '2026-11-11T10:00:00Z')], now, inDays(30));
    expect(r.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('rendición: solo se pasa a rendido desde entregado y con comprobantes que cubran el monto', () => {
    expect(canMoveRequest('delivered', 'settled')).toBe(true);
    expect(canMoveRequest('approved', 'settled')).toBe(false);
    expect(canMoveRequest('settled', 'rejected')).toBe(false);
    expect(canSettle(1000, [])).toBe(false);
    expect(canSettle(1000, [{ amount: 400 }])).toBe(false);
    expect(canSettle(1000, [{ amount: 400 }, { amount: 600 }])).toBe(true);
    expect(canSettle(null, [{ amount: 1 }])).toBe(true);
  });

  it('evolución: cuenta por mes e incluye meses vacíos', () => {
    const r = countByMonth([new Date('2026-11-02T00:00:00Z'), new Date('2026-11-09T00:00:00Z'), new Date('2026-09-15T00:00:00Z'), new Date('2025-01-01T00:00:00Z')], 3, now);
    expect(r).toEqual([{ month: '2026-09', count: 1 }, { month: '2026-10', count: 0 }, { month: '2026-11', count: 2 }]);
  });

  it('avisos de vencimiento a 30 y 7 días', () => {
    expect(reminderBucket(inDays(7), now)).toBe(7);
    expect(reminderBucket(inDays(30), now)).toBe(30);
    expect(reminderBucket(inDays(15), now)).toBeNull();
    expect(reminderBucket(null, now)).toBeNull();
  });
});
