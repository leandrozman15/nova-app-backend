import {
  attendanceRate,
  hasRoom,
  isValidDay,
  normalizeDni,
} from './program-rules';

describe('program-rules', () => {
  it('valida días reales en formato AAAA-MM-DD', () => {
    expect(isValidDay('2026-11-04')).toBe(true);
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('04/11/2026')).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
  });

  it('el cupo: sin tope siempre hay lugar; con tope, hasta llenarse', () => {
    expect(hasRoom(null, 500)).toBe(true);
    expect(hasRoom(undefined, 500)).toBe(true);
    expect(hasRoom(20, 19)).toBe(true);
    expect(hasRoom(20, 20)).toBe(false);
  });

  it('el porcentaje de asistencia es null sin registros', () => {
    expect(attendanceRate(0, 0)).toBeNull();
    expect(attendanceRate(3, 4)).toBe(75);
    expect(attendanceRate(1, 3)).toBe(33);
  });

  it('el DNI queda solo con dígitos', () => {
    expect(normalizeDni('30.123.456')).toBe('30123456');
    expect(normalizeDni('  ')).toBeNull();
    expect(normalizeDni(null)).toBeNull();
  });
});
