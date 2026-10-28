import { computeScheduleChange } from './match-schedule.service';

describe('computeScheduleChange', () => {
  const at = new Date('2026-11-01T15:00:00.000Z');
  const now = new Date('2026-11-01T10:00:00.000Z');

  it('atrasa 60 minutos', () => {
    const r = computeScheduleChange(at, { minutes: 60 }, now);
    expect(r.newAt.toISOString()).toBe('2026-11-01T16:00:00.000Z');
    expect(r).toMatchObject({ kind: 'delay', deltaMinutes: 60 });
  });

  it('adelanta con minutos negativos', () => {
    expect(computeScheduleChange(at, { minutes: -30 }, now)).toMatchObject({ kind: 'advance', deltaMinutes: -30 });
  });

  it('reprograma con fecha nueva', () => {
    const r = computeScheduleChange(at, { newDate: new Date('2026-11-02T18:30:00.000Z') }, now);
    expect(r.kind).toBe('reschedule');
    expect(r.deltaMinutes).toBe(27 * 60 + 30);
  });

  it('exige una sola forma de cambio', () => {
    expect(() => computeScheduleChange(at, {}, now)).toThrow();
    expect(() => computeScheduleChange(at, { minutes: 30, newDate: at }, now)).toThrow();
  });

  it('no permite horarios ya pasados ni cambios nulos', () => {
    expect(() => computeScheduleChange(at, { minutes: -400 }, now)).toThrow('ya pasó');
    expect(() => computeScheduleChange(at, { newDate: at }, now)).toThrow('no cambia');
  });
});
