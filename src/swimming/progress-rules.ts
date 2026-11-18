/** Evolución de un nadador por prueba: mejores tiempos y serie cronológica. Sin efectos: fácil de testear. */

export type ProgressRow = {
  stroke: string;
  distance: number;
  poolLength: number;
  timeMs: number;
  status: string;
  /** training | meet */
  source: string;
  workoutId?: string | null;
  recordedAt: Date;
};

export type TimeMark = {
  timeMs: number;
  recordedAt: string;
  source: string;
  fromWorkout: boolean;
};

export type EventProgress = {
  stroke: string;
  distance: number;
  poolLength: number;
  /** Los 3 mejores tiempos en entrenamiento (cronómetro y series), con su fecha. */
  bestTraining: TimeMark[];
  /** Los 3 mejores tiempos en competencia. */
  bestMeet: TimeMark[];
  /** Mejor tiempo de cada día, en orden cronológico (para el gráfico de evolución). */
  series: { date: string; timeMs: number; source: string }[];
  /** Cuánto bajó desde el primer día registrado hasta el mejor (ms, positivo = mejoró). */
  improvementMs: number | null;
  count: number;
};

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const mark = (r: ProgressRow): TimeMark => ({
  timeMs: r.timeMs,
  recordedAt: r.recordedAt.toISOString(),
  source: r.source,
  fromWorkout: !!r.workoutId,
});
const top3 = (rows: ProgressRow[]) =>
  [...rows]
    .sort(
      (a, b) =>
        a.timeMs - b.timeMs || a.recordedAt.getTime() - b.recordedAt.getTime(),
    )
    .slice(0, 3)
    .map(mark);

/** Agrupa por estilo, distancia y largo de pileta (25 y 50 no se mezclan). */
export function playerProgress(rows: ProgressRow[]): EventProgress[] {
  const groups = new Map<string, ProgressRow[]>();
  for (const r of rows) {
    if (r.status !== 'ok' || r.timeMs <= 0) continue;
    const key = `${r.stroke}|${r.distance}|${r.poolLength}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((list) => {
      const byDay = new Map<string, ProgressRow>();
      for (const r of list) {
        const d = dayOf(r.recordedAt);
        const cur = byDay.get(d);
        if (!cur || r.timeMs < cur.timeMs) byDay.set(d, r);
      }
      const series = [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, r]) => ({ date, timeMs: r.timeMs, source: r.source }));
      const best = Math.min(...list.map((r) => r.timeMs));
      return {
        stroke: list[0].stroke,
        distance: list[0].distance,
        poolLength: list[0].poolLength,
        bestTraining: top3(list.filter((r) => r.source !== 'meet')),
        bestMeet: top3(list.filter((r) => r.source === 'meet')),
        series,
        improvementMs: series.length > 1 ? series[0].timeMs - best : null,
        count: list.length,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.stroke.localeCompare(b.stroke) ||
        a.distance - b.distance,
    );
}
