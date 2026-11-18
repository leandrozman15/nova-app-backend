import { playerProgress, type ProgressRow } from './progress-rules';

const row = (
  timeMs: number,
  day: string,
  extra: Partial<ProgressRow> = {},
): ProgressRow => ({
  stroke: 'freestyle',
  distance: 50,
  poolLength: 25,
  timeMs,
  status: 'ok',
  source: 'training',
  recordedAt: new Date(`${day}T10:00:00Z`),
  ...extra,
});

describe('playerProgress', () => {
  it('da los 3 mejores de entrenamiento con fecha y separa competencia', () => {
    const [ev] = playerProgress([
      row(36000, '2026-09-01'),
      row(35000, '2026-09-08', { workoutId: 'w1' }),
      row(34500, '2026-09-15'),
      row(35500, '2026-09-22'),
      row(34000, '2026-10-01', { source: 'meet' }),
    ]);
    expect(ev.bestTraining.map((m) => m.timeMs)).toEqual([34500, 35000, 35500]);
    expect(ev.bestTraining[1]).toMatchObject({
      fromWorkout: true,
      recordedAt: '2026-09-08T10:00:00.000Z',
    });
    expect(ev.bestMeet.map((m) => m.timeMs)).toEqual([34000]);
    expect(ev.improvementMs).toBe(2000);
  });

  it('arma la serie con el mejor tiempo de cada día, en orden', () => {
    const [ev] = playerProgress([
      row(36000, '2026-09-02'),
      row(35800, '2026-09-01'),
      row(36500, '2026-09-01'),
    ]);
    expect(ev.series).toEqual([
      { date: '2026-09-01', timeMs: 35800, source: 'training' },
      { date: '2026-09-02', timeMs: 36000, source: 'training' },
    ]);
  });

  it('no mezcla pileta de 25 y 50 ni cuenta tiempos inválidos', () => {
    const out = playerProgress([
      row(36000, '2026-09-01'),
      row(37000, '2026-09-01', { poolLength: 50 }),
      row(0, '2026-09-01', { status: 'dnf' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.count === 1)).toBe(true);
  });
});
