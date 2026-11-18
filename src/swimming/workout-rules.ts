/** Reglas de los entrenamientos cronometrados (series de repeticiones). Sin efectos: fáciles de testear. */

export type RepInput = {
  playerId: string;
  rep: number;
  timeMs: number;
  status: string;
};

export type SwimmerSummary = {
  playerId: string;
  /** Tiempo de cada repetición en orden (null: no la hizo o no tiene tiempo válido). */
  times: (number | null)[];
  completed: number;
  avgMs: number | null;
  bestMs: number | null;
  worstMs: number | null;
  /** Diferencia entre la peor y la mejor repetición: cuanto menor, más parejo. */
  spreadMs: number | null;
  /** Promedio de la segunda mitad menos el de la primera: positivo = se fue cansando. */
  fadeMs: number | null;
};

/** Distancias de entrenamiento: de 25 en 25, hasta 1500 m. */
export function isValidWorkoutDistance(distance: number): boolean {
  return (
    Number.isInteger(distance) &&
    distance >= 25 &&
    distance <= 1500 &&
    distance % 25 === 0
  );
}

/** Devuelve el problema de las repeticiones cargadas, o null si están bien. */
export function workoutEntriesProblem(
  entries: RepInput[],
  reps: number,
): string | null {
  const seen = new Set<string>();
  for (const e of entries) {
    if (!Number.isInteger(e.rep) || e.rep < 1 || e.rep > reps)
      return `La repetición ${e.rep} no existe en esta serie`;
    const key = `${e.playerId}|${e.rep}`;
    if (seen.has(key))
      return 'Hay una repetición cargada dos veces para el mismo nadador';
    seen.add(key);
    if (e.status === 'ok' && !(e.timeMs > 0))
      return 'Un tiempo válido debe ser mayor a cero';
  }
  return null;
}

const avg = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

/** Resumen por nadador: tiempos por repetición, promedio, mejor, peor, dispersión y caída. */
export function summarizeWorkout(
  rows: RepInput[],
  reps: number,
): SwimmerSummary[] {
  const byPlayer = new Map<string, (number | null)[]>();
  for (const r of rows) {
    if (r.rep < 1 || r.rep > reps) continue;
    const list =
      byPlayer.get(r.playerId) ?? Array<number | null>(reps).fill(null);
    list[r.rep - 1] = r.status === 'ok' && r.timeMs > 0 ? r.timeMs : null;
    byPlayer.set(r.playerId, list);
  }
  return [...byPlayer.entries()].map(([playerId, times]) => {
    const valid = times.filter((t): t is number => t !== null);
    const half = Math.floor(reps / 2);
    const first = times.slice(0, half).filter((t): t is number => t !== null);
    const second = times
      .slice(reps - half)
      .filter((t): t is number => t !== null);
    const a = avg(first);
    const b = avg(second);
    const best = valid.length ? Math.min(...valid) : null;
    const worst = valid.length ? Math.max(...valid) : null;
    return {
      playerId,
      times,
      completed: valid.length,
      avgMs: avg(valid),
      bestMs: best,
      worstMs: worst,
      spreadMs: best !== null && worst !== null ? worst - best : null,
      fadeMs: half > 0 && a !== null && b !== null ? b - a : null,
    };
  });
}
