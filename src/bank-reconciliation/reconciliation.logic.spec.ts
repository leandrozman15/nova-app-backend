import {
  movementHashes,
  suggestFees,
  type FeeCandidate,
} from './reconciliation.logic';

const fee = (over: Partial<FeeCandidate> & { id: string }): FeeCandidate => ({
  amount: 15000,
  amountWithLateFee: 16500,
  month: 11,
  year: 2026,
  playerName: { first: 'Juan', last: 'Pérez' },
  ...over,
});

describe('movementHashes', () => {
  const row = {
    date: '2026-11-10',
    description: 'TRANSF PEREZ JUAN',
    amount: 15000,
  };
  it('es estable y distingue repeticiones dentro del mismo archivo', () => {
    const [a, b] = movementHashes([row, row]);
    expect(a).not.toBe(b);
    expect(movementHashes([row, row])).toEqual([a, b]);
  });
  it('ignora mayúsculas y tildes del concepto', () => {
    expect(
      movementHashes([{ ...row, description: 'transf pérez juan' }]),
    ).toEqual(movementHashes([row]));
  });
});

describe('suggestFees', () => {
  const m = {
    description: 'Transferencia recibida PEREZ JUAN cuota',
    amount: 15000,
    date: '2026-11-12',
  };

  it('sugiere con confianza alta cuando coinciden monto, nombre y período', () => {
    const [s] = suggestFees(m, [fee({ id: 'a' })]);
    expect(s).toMatchObject({ feeId: 'a', confidence: 'high', extra: 0 });
  });

  it('acepta monto con mora y devuelve el excedente', () => {
    const [s] = suggestFees({ ...m, amount: 16500 }, [fee({ id: 'a' })]);
    expect(s).toMatchObject({ feeId: 'a', extra: 1500 });
  });

  it('sin coincidencia de monto no sugiere nada', () => {
    expect(suggestFees({ ...m, amount: 9999 }, [fee({ id: 'a' })])).toEqual([]);
  });

  it('prefiere al atleta nombrado entre cuotas del mismo monto', () => {
    const list = suggestFees(m, [
      fee({ id: 'otro', playerName: { first: 'Luis', last: 'Gómez' } }),
      fee({ id: 'juan' }),
    ]);
    expect(list.map((x) => x.feeId)).toEqual(['juan', 'otro']);
    expect(list[1].confidence).toBe('low');
  });

  it('reconoce a quien paga cuando el concepto no nombra al atleta', () => {
    const [s] = suggestFees(
      { description: 'TRANSF LOPEZ MARIA', amount: 15000, date: '2026-11-12' },
      [fee({ id: 'a', payerNames: ['María López'] })],
    );
    expect(s.reasons).toContain('El concepto nombra a quien suele pagar');
  });

  it('los débitos no pagan cuotas', () => {
    expect(suggestFees({ ...m, amount: -15000 }, [fee({ id: 'a' })])).toEqual(
      [],
    );
  });
});
