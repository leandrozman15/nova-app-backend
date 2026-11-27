import { createHash } from 'node:crypto';

/** Lógica pura de la conciliación: huellas para no duplicar y sugerencias de cuota por movimiento. */

export type RawMovement = {
  date: string; // AAAA-MM-DD
  description: string;
  reference?: string | null;
  amount: number; // + acreditación, - débito
};

export type FeeCandidate = {
  id: string;
  /** Valor de la cuota sin mora. */
  amount: number;
  /** Cuota + mora a la fecha del movimiento. */
  amountWithLateFee: number;
  month: number;
  year: number;
  playerName: { first: string; last: string };
  /** Nombre de quien suele pagar (madre/padre/tutor), si la ficha lo tiene. */
  payerNames?: string[];
};

export type Suggestion = {
  feeId: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  /** Cuánto del movimiento excede la cuota (intereses por mora). */
  extra: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const fold = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Huella de cada renglón; los idénticos dentro del mismo archivo se distinguen por su repetición. */
export function movementHashes(rows: RawMovement[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [
      r.date,
      round2(r.amount).toFixed(2),
      fold(r.description),
      fold(r.reference ?? ''),
    ].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash('sha1').update(`${base}|${n}`).digest('hex');
  });
}

const nameTokens = (value: string) =>
  fold(value)
    .split(' ')
    .filter((t) => t.length >= 3);

const hasAll = (haystack: string, tokens: string[]) =>
  tokens.length > 0 && tokens.every((t) => haystack.includes(t));

/**
 * Cuotas sin cobrar que podrían corresponder a una acreditación, de más a menos probable.
 * Cuenta el monto (cuota o cuota + mora), que el concepto nombre al atleta o a quien paga,
 * y la cercanía del período. Sin coincidencia de monto no se sugiere nada.
 */
export function suggestFees(
  movement: Pick<RawMovement, 'description' | 'amount' | 'date'>,
  fees: FeeCandidate[],
  limit = 3,
): Suggestion[] {
  if (!(movement.amount > 0)) return [];
  const text = fold(movement.description);
  const out: Suggestion[] = [];
  for (const fee of fees) {
    const reasons: string[] = [];
    let score = 0;
    const paid = round2(movement.amount);
    if (paid === round2(fee.amount)) {
      score += 50;
      reasons.push('Monto igual a la cuota');
    } else if (paid === round2(fee.amountWithLateFee)) {
      score += 50;
      reasons.push('Monto igual a cuota + mora');
    } else {
      continue;
    }
    const last = nameTokens(fee.playerName.last);
    const first = nameTokens(fee.playerName.first);
    if (
      hasAll(text, last) &&
      (first.length === 0 || first.some((t) => text.includes(t)))
    ) {
      score += 40;
      reasons.push('El concepto nombra al atleta');
    } else if (hasAll(text, last)) {
      score += 25;
      reasons.push('El concepto tiene el apellido del atleta');
    } else {
      const payer = (fee.payerNames ?? []).find((n) =>
        hasAll(text, nameTokens(n)),
      );
      if (payer) {
        score += 30;
        reasons.push('El concepto nombra a quien suele pagar');
      }
    }
    // Cuota del mes anterior o del mismo mes de la acreditación: más probable que una vieja.
    const d = new Date(`${movement.date}T12:00:00Z`);
    const gap =
      (d.getUTCFullYear() - fee.year) * 12 + (d.getUTCMonth() + 1 - fee.month);
    if (gap >= 0 && gap <= 1) {
      score += 10;
      reasons.push('Período cercano');
    }
    out.push({
      feeId: fee.id,
      score,
      confidence: score >= 90 ? 'high' : score >= 75 ? 'medium' : 'low',
      reasons,
      extra: Math.max(0, round2(paid - fee.amount)),
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
