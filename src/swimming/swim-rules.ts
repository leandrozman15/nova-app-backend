export const STROKES = ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'medley'] as const;
export type Stroke = (typeof STROKES)[number];
export const TIME_STATUSES = ['ok', 'dq', 'dns', 'dnf'] as const;

const DISTANCES: Record<Stroke, number[]> = {
  freestyle: [25, 50, 100, 200, 400, 800, 1500],
  backstroke: [25, 50, 100, 200],
  breaststroke: [25, 50, 100, 200],
  butterfly: [25, 50, 100, 200],
  medley: [100, 200, 400],
};

export function isValidEvent(stroke: string, distance: number): boolean {
  return (STROKES as readonly string[]).includes(stroke) && DISTANCES[stroke as Stroke].includes(distance);
}

export type RankInput = { id: string; timeMs: number; status: string };

/** Posiciones por tiempo: solo cuentan los 'ok' con tiempo > 0; empate = misma posición. */
export function rankResults<T extends RankInput>(rows: T[]): Array<T & { place: number | null }> {
  const valid = rows.filter((r) => r.status === 'ok' && r.timeMs > 0).sort((a, b) => a.timeMs - b.timeMs);
  const placeOf = new Map<string, number>();
  valid.forEach((r, i) => {
    const prev = valid[i - 1];
    placeOf.set(r.id, prev && prev.timeMs === r.timeMs ? placeOf.get(prev.id)! : i + 1);
  });
  return rows.map((r) => ({ ...r, place: placeOf.get(r.id) ?? null }));
}

export type PbInput = { playerId: string; stroke: string; distance: number; poolLength: number; timeMs: number; status: string; recordedAt: Date };
export type PersonalBest = { playerId: string; stroke: string; distance: number; poolLength: number; timeMs: number; recordedAt: Date };

/** Mejor marca por persona, estilo, distancia y largo de pileta (25 y 50 no se mezclan). */
export function personalBests(rows: PbInput[]): PersonalBest[] {
  const best = new Map<string, PersonalBest>();
  for (const r of rows) {
    if (r.status !== 'ok' || r.timeMs <= 0) continue;
    const key = `${r.playerId}|${r.stroke}|${r.distance}|${r.poolLength}`;
    const cur = best.get(key);
    if (!cur || r.timeMs < cur.timeMs) {
      best.set(key, { playerId: r.playerId, stroke: r.stroke, distance: r.distance, poolLength: r.poolLength, timeMs: r.timeMs, recordedAt: r.recordedAt });
    }
  }
  return [...best.values()];
}

/** Los parciales deben ser crecientes y no superar el tiempo final. */
export function validSplits(splits: number[], timeMs: number): boolean {
  let prev = 0;
  for (const s of splits) {
    if (!Number.isInteger(s) || s <= prev) return false;
    prev = s;
  }
  return timeMs === 0 || prev <= timeMs;
}
