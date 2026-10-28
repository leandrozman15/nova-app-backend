import { attendancePercent, monthRange } from './attendance.service';

describe('attendance helpers', () => {
  it('cuenta tardanzas como asistencia y no penaliza justificadas', () => {
    expect(attendancePercent({ present: 6, late: 2, absent: 2, justified: 5 })).toBe(80);
  });
  it('sin registros devuelve 0', () => {
    expect(attendancePercent({ present: 0, late: 0, absent: 0, justified: 3 })).toBe(0);
  });
  it('arma el rango del mes (UTC) incluyendo diciembre', () => {
    const r = monthRange('2026-12');
    expect(r.from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  it('rechaza meses inválidos', () => {
    expect(() => monthRange('2026-13')).toThrow();
  });
});
