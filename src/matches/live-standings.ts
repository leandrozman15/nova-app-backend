/** Tabla de la competencia para la tarjeta del Live: posiciones actuales de los dos equipos. Sin efectos. */

type Doc = Record<string, unknown>;

export type LiveTableRow = {
  position: number;
  name: string;
  logo: string | null;
  points: number;
  played: number;
  side: 'home' | 'away' | null;
};
export type LiveTable = {
  name: string | null;
  rows: LiveTableRow[];
  homePosition: number | null;
  awayPosition: number | null;
};

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const norm = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Ordena por puntos, diferencia y goles a favor. El equipo propio es la fila interna (o con el id del club);
 * el rival se busca por nombre. Devuelve hasta `limit` filas, asegurando que estén las de los dos equipos.
 */
export function liveTable(
  rows: Doc[],
  opts: {
    clubId: string;
    awayName: string;
    name?: string | null;
    limit?: number;
  },
): LiveTable | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort(
    (a, b) =>
      n(b.points) - n(a.points) ||
      n(b.goalsFor) - n(b.goalsAgainst) - (n(a.goalsFor) - n(a.goalsAgainst)) ||
      n(b.goalsFor) - n(a.goalsFor) ||
      s(a.teamName).localeCompare(s(b.teamName)),
  );
  const away = norm(opts.awayName);
  const all: LiveTableRow[] = sorted.map((r, i) => {
    const home = r.isInternal === true || s(r.teamId) === opts.clubId;
    const name = s(r.teamName) || '—';
    const isAway =
      !home &&
      !!away &&
      (norm(name) === away ||
        norm(name).startsWith(away) ||
        away.startsWith(norm(name)));
    return {
      position: i + 1,
      name,
      logo: s(r.teamLogo) || null,
      points: n(r.points),
      played: n(r.played),
      side: home ? 'home' : isAway ? 'away' : null,
    };
  });
  const limit = opts.limit ?? 5;
  const pick = all.filter((r, i) => i < limit || r.side !== null);
  return {
    name: opts.name ?? null,
    rows: pick.slice(0, Math.max(limit, pick.length)),
    homePosition: all.find((r) => r.side === 'home')?.position ?? null,
    awayPosition: all.find((r) => r.side === 'away')?.position ?? null,
  };
}
