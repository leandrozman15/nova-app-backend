import { feeReference, feeTreasuryEntry } from './fee-treasury';

const base = {
  id: 'f1',
  companyId: 'c1',
  clubId: 'club1',
  month: 11,
  year: 2026,
  amount: '15000.00',
  status: 'paid',
  paymentMethod: 'Efectivo',
  paymentDate: new Date('2026-11-20T15:00:00Z'),
  player: { firstName: 'Ana', lastName: 'Demo' },
};

describe('cuota cobrada → caja', () => {
  it('arma un ingreso con la referencia de la cuota', () => {
    expect(feeTreasuryEntry(base)).toEqual({
      companyId: 'c1',
      clubId: 'club1',
      type: 'income',
      category: 'Cuotas sociales',
      amount: 15000,
      occurredAt: base.paymentDate,
      description: 'Cuota Noviembre 2026 · Demo, Ana · Efectivo',
      reference: feeReference('f1'),
    });
  });

  it('no registra nada si no está pagada, si entró por Mercado Pago o sin monto', () => {
    expect(feeTreasuryEntry({ ...base, status: 'pending' })).toBeNull();
    expect(feeTreasuryEntry({ ...base, mpPaymentId: '123' })).toBeNull();
    expect(feeTreasuryEntry({ ...base, amount: '0' })).toBeNull();
  });
});
