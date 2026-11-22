/** Reglas puras del cuadro de eliminación directa (sin base de datos). */

export type BracketSlot = {
  round: number;
  position: number;
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
};

/** Próxima potencia de 2 (mínimo 2). */
export function bracketSize(teams: number) {
  let size = 2;
  while (size < teams) size *= 2;
  return size;
}

export function roundsFor(teams: number) {
  return Math.log2(bracketSize(teams));
}

/**
 * Orden clásico de cabezas de serie: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6…
 * Devuelve, para cada lugar del cuadro, el número de siembra (1 = el mejor).
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((s) => [s, next - s]);
  }
  return order;
}

/**
 * Primera ronda: los equipos ya ordenados por siembra. Los lugares vacíos son
 * "libres" y le tocan a los mejores sembrados, que pasan directo.
 */
export function firstRound(teamIds: string[]): BracketSlot[] {
  const size = bracketSize(teamIds.length);
  const order = seedOrder(size);
  const slots: BracketSlot[] = [];
  for (let i = 0; i < size; i += 2) {
    const a = teamIds[order[i] - 1] ?? null;
    const b = teamIds[order[i + 1] - 1] ?? null;
    slots.push({
      round: 1,
      position: i / 2,
      teamAId: a,
      teamBId: b,
      winnerId: a && !b ? a : !a && b ? b : null,
    });
  }
  return slots;
}

/** Cuadro completo: primera ronda y rondas siguientes vacías, con los libres ya avanzados. */
export function buildBracket(teamIds: string[]): BracketSlot[] {
  if (teamIds.length < 2) return [];
  const rounds = roundsFor(teamIds.length);
  const all: BracketSlot[] = [...firstRound(teamIds)];
  for (let round = 2; round <= rounds; round++) {
    const count = bracketSize(teamIds.length) / 2 ** round;
    for (let position = 0; position < count; position++)
      all.push({ round, position, teamAId: null, teamBId: null, winnerId: null });
  }
  for (const slot of all.filter((s) => s.round === 1 && s.winnerId))
    advance(all, slot, slot.winnerId);
  return all;
}

/** Lugar al que pasa el ganador de un partido. */
export function nextSlot(round: number, position: number) {
  return {
    round: round + 1,
    position: Math.floor(position / 2),
    side: position % 2 === 0 ? ('A' as const) : ('B' as const),
  };
}

/** Pone (o saca, con null) al ganador en el partido siguiente. Modifica la lista. */
export function advance(
  all: BracketSlot[],
  from: { round: number; position: number },
  winnerId: string | null,
) {
  const next = nextSlot(from.round, from.position);
  const target = all.find(
    (s) => s.round === next.round && s.position === next.position,
  );
  if (!target) return null;
  if (next.side === 'A') target.teamAId = winnerId;
  else target.teamBId = winnerId;
  return target;
}

export function roundName(round: number, rounds: number) {
  const left = rounds - round;
  if (left === 0) return 'Final';
  if (left === 1) return 'Semifinal';
  if (left === 2) return 'Cuartos de final';
  if (left === 3) return 'Octavos de final';
  return `${2 ** left}avos de final`;
}

/** "Pérez / Gómez" a partir de los nombres de la pareja. */
export function teamLabel(players: { name: string }[]) {
  return players
    .map((p) => p.name.trim())
    .filter(Boolean)
    .join(' / ');
}

/** Clave de la programación: si cambia, hay que volver a avisar. */
export function scheduleKey(m: {
  date: string | null;
  startMinute: number | null;
  court: string | null;
}) {
  if (!m.date || m.startMinute === null || m.startMinute === undefined)
    return null;
  return `${m.date}|${m.startMinute}|${m.court ?? ''}`;
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function scheduleText(m: {
  date: string | null;
  startMinute: number | null;
  court: string | null;
}) {
  if (!m.date || m.startMinute === null) return 'a confirmar';
  const [y, mo, d] = m.date.split('-').map(Number);
  const day = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const hh = String(Math.floor(m.startMinute / 60)).padStart(2, '0');
  const mm = String(m.startMinute % 60).padStart(2, '0');
  return `${day} ${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')} ${hh}:${mm}${m.court ? ` · ${m.court}` : ''}`;
}
