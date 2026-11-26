import { computeLateFee, defaultDueDay, type LateFeeConfig } from './late-fee';

const at = (ymd: string) => new Date(`${ymd}T15:00:00.000Z`); // mediodía en Buenos Aires
const fee = {
  amount: 10000,
  month: 11,
  year: 2026,
  dueDate: new Date('2026-11-10T12:00:00.000Z'),
};
const daily: LateFeeConfig = {
  mode: 'daily',
  percent: 10,
  graceDays: 0,
  maxPercent: null,
};
const fixed: LateFeeConfig = {
  mode: 'fixed',
  percent: 10,
  graceDays: 0,
  maxPercent: null,
};

describe('computeLateFee', () => {
  it('no cobra nada antes ni el mismo día del vencimiento', () => {
    expect(computeLateFee(fee, daily, at('2026-11-10')).amount).toBe(0);
    expect(computeLateFee(fee, fixed, at('2026-11-05')).amount).toBe(0);
  });

  it('fija: el 10% completo desde el día siguiente al vencimiento', () => {
    const r = computeLateFee(fee, fixed, at('2026-11-11'));
    expect(r).toMatchObject({
      daysLate: 1,
      percent: 10,
      amount: 1000,
      total: 11000,
    });
    expect(computeLateFee(fee, fixed, at('2026-12-20')).amount).toBe(1000);
  });

  it('progresiva: 10% mensual prorrateado por día', () => {
    expect(computeLateFee(fee, daily, at('2026-11-11'))).toMatchObject({
      percent: 0.33,
      amount: 33,
    });
    expect(computeLateFee(fee, daily, at('2026-11-25')).percent).toBe(5);
    expect(computeLateFee(fee, daily, at('2026-12-10')).percent).toBe(10);
  });

  it('respeta los días de gracia y el tope', () => {
    const cfg: LateFeeConfig = {
      mode: 'daily',
      percent: 10,
      graceDays: 5,
      maxPercent: 8,
    };
    expect(computeLateFee(fee, cfg, at('2026-11-15')).amount).toBe(0);
    expect(computeLateFee(fee, cfg, at('2026-11-25')).percent).toBe(3.33);
    expect(computeLateFee(fee, cfg, at('2027-03-01')).percent).toBe(8);
  });

  it('sin vencimiento vence el último día del mes y apagada no cobra', () => {
    expect(defaultDueDay(2, 2028)).toBe('2028-02-29');
    const open = { amount: 5000, month: 11, year: 2026 };
    expect(computeLateFee(open, fixed, at('2026-11-30')).amount).toBe(0);
    expect(computeLateFee(open, fixed, at('2026-12-01')).amount).toBe(500);
    expect(
      computeLateFee(fee, { ...fixed, mode: 'off' }, at('2027-01-01')).amount,
    ).toBe(0);
  });

  it('usa el día de la zona horaria del club, no el de UTC', () => {
    // 02:00 UTC del 11 = 23:00 del 10 en Buenos Aires: todavía no venció.
    expect(
      computeLateFee(fee, fixed, new Date('2026-11-11T02:00:00Z')).amount,
    ).toBe(0);
  });
});
