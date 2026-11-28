import { roundName } from '../tournaments/bracket-rules';

export type BracketMatchLite = {
  round: number;
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
};

/**
 * En qué quedó un equipo en el cuadro de eliminación directa: null si todavía no tiene
 * ningún partido asignado (inscripto pero sin cuadro armado todavía).
 */
export function placementOf(
  matches: BracketMatchLite[],
  teamId: string,
  totalRounds: number,
): { label: string; champion: boolean } | null {
  const mine = matches.filter((m) => m.teamAId === teamId || m.teamBId === teamId);
  if (!mine.length || totalRounds < 1) return null;
  const last = mine.reduce((a, b) => (b.round > a.round ? b : a));
  if (last.winnerId == null) return { label: `Jugando ${roundName(last.round, totalRounds)}`, champion: false };
  if (last.winnerId === teamId) {
    if (last.round >= totalRounds) return { label: 'Campeón/a', champion: true };
    return { label: `Avanzó a ${roundName(last.round + 1, totalRounds)}`, champion: false };
  }
  const name = roundName(last.round, totalRounds);
  return { label: name === 'Final' ? 'Subcampeón/a' : `Eliminado en ${name}`, champion: false };
}
