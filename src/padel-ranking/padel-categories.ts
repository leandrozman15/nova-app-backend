/**
 * Categorías de pádel (8va a 1ra) con su rango de puntos ELO y las reglas puras de control:
 * categoría del torneo, suma de pareja con tope, ELO asimétrico y ascensos automáticos.
 */
export const PADEL_CATEGORIES = [
  { code: '8VA', label: '8va', value: 8, min: 0, max: 999, level: 'Iniciación' },
  { code: '7MA', label: '7ma', value: 7, min: 1000, max: 1249, level: 'Amateur inicial' },
  { code: '6TA', label: '6ta', value: 6, min: 1250, max: 1499, level: 'Amateur intermedio' },
  { code: '5TA', label: '5ta', value: 5, min: 1500, max: 1749, level: 'Amateur avanzado' },
  { code: '4TA', label: '4ta', value: 4, min: 1750, max: 1999, level: 'Competitivo regional' },
  { code: '3RA', label: '3ra', value: 3, min: 2000, max: 2299, level: 'Pre-elite / top zonal' },
  { code: '2DA', label: '2da', value: 2, min: 2300, max: 2599, level: 'Semiprofesional' },
  { code: '1RA', label: '1ra', value: 1, min: 2600, max: Infinity, level: 'Elite / profesional' },
] as const;

export type PadelCategory = (typeof PADEL_CATEGORIES)[number]['code'];
export const PADEL_CATEGORY_CODES = PADEL_CATEGORIES.map((c) => c.code);

/** Valor para las sumas: 5ta + 6ta = Suma 11. Mejor categoría = número más chico. */
export const valueOf = (code: string) =>
  PADEL_CATEGORIES.find((c) => c.code === code)?.value ?? 8;

export const isCategory = (code: unknown): code is PadelCategory =>
  typeof code === 'string' && PADEL_CATEGORY_CODES.includes(code as PadelCategory);

export function categoryOfElo(elo: number): PadelCategory {
  const found = PADEL_CATEGORIES.find((c) => elo >= c.min && elo <= c.max);
  return (found ?? PADEL_CATEGORIES[0]).code;
}

/** ELO inicial al declarar una categoría: el piso de su rango (8va arranca en 800). */
export function startingElo(code: PadelCategory) {
  const c = PADEL_CATEGORIES.find((x) => x.code === code)!;
  return code === '8VA' ? 800 : c.min;
}

/** Una categoría mejor (7ma → 6ta). La 1ra no sube más. */
export function oneUp(code: PadelCategory): PadelCategory {
  const v = valueOf(code);
  return PADEL_CATEGORIES.find((c) => c.value === Math.max(1, v - 1))!.code;
}

/** ¿`a` es mejor categoría que `b`? */
export const isBetter = (a: string, b: string) => valueOf(a) < valueOf(b);

export type PadelRules = {
  mode: 'category' | 'suma' | null;
  category?: string | null;
  sum?: number | null;
  top?: string | null;
};
export type PlayerLevel = { name: string; category: string };

/**
 * ¿Puede esta pareja (o jugador) inscribirse?
 * - category: nadie puede ser de una categoría mejor que la del torneo (se puede jugar para arriba).
 * - suma: la suma de categorías de la pareja debe ser ≥ la suma del torneo (más alta = más débil),
 *   y, si hay tope, nadie puede ser mejor que ese tope.
 */
export function checkPlayers(rules: PadelRules, players: PlayerLevel[]) {
  const reasons: string[] = [];
  if (!rules.mode) return { ok: true, reasons };
  if (rules.mode === 'category' && rules.category) {
    const limit = valueOf(rules.category);
    for (const p of players)
      if (valueOf(p.category) < limit)
        reasons.push(
          `${p.name} es de ${label(p.category)} y este torneo es de ${label(rules.category)}: no puede jugar para abajo`,
        );
  }
  if (rules.mode === 'suma' && rules.sum) {
    const total = players.reduce((n, p) => n + valueOf(p.category), 0);
    if (total < rules.sum)
      reasons.push(`La pareja suma ${total} y el torneo es Suma ${rules.sum} (tiene que sumar ${rules.sum} o más)`);
    if (rules.top) {
      const top = valueOf(rules.top);
      for (const p of players)
        if (valueOf(p.category) < top)
          reasons.push(`${p.name} es de ${label(p.category)} y el tope del torneo es ${label(rules.top)}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export const label = (code: string) =>
  PADEL_CATEGORIES.find((c) => c.code === code)?.label ?? code;

export const ELO_K = 40;

/** Cambio de ELO de una pareja ganadora sobre otra: ganarle a una pareja más fuerte suma más. */
export function eloDelta(winnerElo: number, loserElo: number, k = ELO_K) {
  const expected = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  return Math.max(1, Math.round(k * (1 - expected)));
}

/** Nuevo ELO tras perder: nunca baja del piso de su categoría. */
export function applyLoss(elo: number, delta: number, floorCategory: PadelCategory) {
  const floorMin = PADEL_CATEGORIES.find((c) => c.code === floorCategory)!.min;
  return Math.max(floorMin, elo - delta);
}

/** Ascenso automático: campeón con ≥ minTeams parejas, o dos finales en 60 días. */
export const CHAMPION_MIN_TEAMS = 12;
export const FINALS_WINDOW_DAYS = 60;
export function shouldPromote(input: {
  kind: 'champion' | 'finalist';
  teamsCount: number;
  finalsInWindow: number;
}) {
  if (input.kind === 'champion' && input.teamsCount >= CHAMPION_MIN_TEAMS) return 'champion';
  if (input.finalsInWindow >= 2) return 'two_finals';
  return null;
}

/** Bajar de categoría: libre mientras es provisional; después, solo con motivo válido o a los 6 meses. */
export const LOWER_LOCK_DAYS = 183;
export const LOWER_REASONS = ['inactividad', 'lesion'] as const;
export function canLower(input: {
  isProvisional: boolean;
  lastChangeAt: Date | null;
  reason?: string;
  now?: Date;
}) {
  if (input.isProvisional) return true;
  if (input.reason && (LOWER_REASONS as readonly string[]).includes(input.reason)) return true;
  if (!input.lastChangeAt) return true;
  const days = ((input.now ?? new Date()).getTime() - input.lastChangeAt.getTime()) / 86_400_000;
  return days >= LOWER_LOCK_DAYS;
}
