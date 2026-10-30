import { toDueDate } from './player-payments.service';

describe('toDueDate', () => {
  it('guarda la fecha al mediodía UTC para que no cambie de día', () => {
    expect(toDueDate('2026-11-10')?.toISOString()).toBe(
      '2026-11-10T12:00:00.000Z',
    );
  });
  it('sin fecha no cambia nada', () => {
    expect(toDueDate(undefined)).toBeUndefined();
    expect(toDueDate('')).toBeUndefined();
  });
});
