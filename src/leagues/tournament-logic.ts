import { BadRequestException } from '@nestjs/common';

export type Pairing = { round: number; home: string; away: string };

/** Método del círculo: todos contra todos; con cantidad impar un equipo descansa cada jornada. */
export function roundRobin(teamIds: string[], rounds: 1 | 2): Pairing[] {
  const slots: (string | null)[] = [...teamIds];
  if (slots.length % 2 === 1) slots.push(null);
  const n = slots.length;
  const days = n - 1;
  const out: Pairing[] = [];

  for (let day = 0; day < days; day++) {
    for (let i = 0; i < n / 2; i++) {
      const a = slots[i];
      const b = slots[n - 1 - i];
      if (a && b) {
        const flip = (day + i) % 2 === 1;
        out.push({ round: day + 1, home: flip ? b : a, away: flip ? a : b });
      }
    }
    slots.splice(1, 0, slots.pop() as string | null);
  }

  if (rounds === 2) {
    const first = [...out];
    for (const m of first) out.push({ round: m.round + days, home: m.away, away: m.home });
  }
  return out;
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Reparte equipos (ya ordenados por cabeza de serie) en grupos: 1.º al A, 2.º al B, … */
export function splitGroups<T>(items: T[], groupCount: number): T[][] {
  const groups: T[][] = Array.from({ length: groupCount }, () => []);
  items.forEach((item, i) => groups[i % groupCount].push(item));
  return groups;
}

export const groupLabel = (index: number) => `Grupo ${String.fromCharCode(65 + index)}`;

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Posiciones (1-based) en el orden de la llave: 1 vs p, 4 vs p-3, … los mejores se cruzan lo más tarde posible. */
export function bracketOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

export type BracketPair = { slot: number; home: string; away: string | null };

/** `seeds[i]` es el equipo de la semilla i+1. `away` null = pasa directo (bye). */
export function firstRoundPairs(seeds: string[]): BracketPair[] {
  const n = seeds.length;
  const order = bracketOrder(nextPow2(n));
  const pairs: BracketPair[] = [];
  for (let slot = 0; slot < order.length / 2; slot++) {
    const a = order[slot * 2];
    const b = order[slot * 2 + 1];
    pairs.push({ slot, home: seeds[a - 1], away: b <= n ? seeds[b - 1] : null });
  }
  return pairs;
}

export function roundLabel(teamsInRound: number): string {
  switch (teamsInRound) {
    case 2: return 'Final';
    case 4: return 'Semifinales';
    case 8: return 'Cuartos de final';
    case 16: return 'Octavos de final';
    default: return `Ronda de ${teamsInRound}`;
  }
}

export type KoMatch = {
  slot: number;
  home: string;
  away: string;
  played: boolean;
  homeScore: number;
  awayScore: number;
  homePens?: number | null;
  awayPens?: number | null;
};

export function matchWinner(m: KoMatch): string | null {
  if (!m.played) return null;
  if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? m.home : m.away;
  if (m.homePens != null && m.awayPens != null && m.homePens !== m.awayPens) {
    return m.homePens > m.awayPens ? m.home : m.away;
  }
  return null;
}

export type NextRoundPlan =
  | { finished: true; champion: string }
  | {
      finished: false;
      label: string;
      pairs: { slot: number; home: string; away: string }[];
      thirdPlace?: { home: string; away: string };
    };

/** Dada la ronda `round` ya jugada, arma la siguiente (o declara campeón). */
export function planNextRound(seeds: string[], round: number, cur: KoMatch[]): NextRoundPlan {
  const roundTeams = nextPow2(seeds.length) / 2 ** (round - 1);
  if (cur.length === 0 || cur.some((m) => !m.played)) {
    throw new BadRequestException('Faltan resultados de la ronda actual');
  }

  const winners = new Map<number, string>();
  const losers: string[] = [];
  for (const m of cur) {
    const winner = matchWinner(m);
    if (!winner) throw new BadRequestException('Hay partidos empatados sin definición por penales');
    winners.set(m.slot, winner);
    losers.push(winner === m.home ? m.away : m.home);
  }

  if (roundTeams === 2) return { finished: true, champion: winners.get(cur[0].slot) as string };

  if (round === 1) {
    for (const pair of firstRoundPairs(seeds)) if (!pair.away) winners.set(pair.slot, pair.home);
  }

  const next = roundTeams / 2;
  const pairs: { slot: number; home: string; away: string }[] = [];
  for (let i = 0; i < next / 2; i++) {
    const home = winners.get(i * 2);
    const away = winners.get(i * 2 + 1);
    if (!home || !away) throw new BadRequestException('La llave está incompleta');
    pairs.push({ slot: i, home, away });
  }

  const thirdPlace = roundTeams === 4 && losers.length === 2 ? { home: losers[0], away: losers[1] } : undefined;
  return { finished: false, label: roundLabel(next), pairs, thirdPlace };
}

export type TableRow = {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

type ScoredMatch = { homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number };

export function buildTable(teams: { id: string; name: string }[], played: ScoredMatch[]): TableRow[] {
  const table = new Map<string, TableRow>(
    teams.map((t) => [
      t.id,
      { teamId: t.id, teamName: t.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    ]),
  );
  for (const m of played) {
    const home = table.get(m.homeTeamId);
    const away = table.get(m.awayTeamId);
    if (!home || !away) continue;
    home.played++; away.played++;
    home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) { home.won++; home.points += 3; away.lost++; }
    else if (m.homeScore < m.awayScore) { away.won++; away.points += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.points++; away.points++; }
  }
  return rankRows(Array.from(table.values()).map((r) => ({ ...r, goalDifference: r.goalsFor - r.goalsAgainst })));
}

export function rankRows<T extends TableRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName),
  );
}
