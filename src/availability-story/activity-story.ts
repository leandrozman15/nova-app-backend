/**
 * Historia de una actividad o disciplina: horarios por grupo, profes, valor e "inscripciones abiertas".
 * Sin efectos: arma los datos; el dibujo está en story-render.ts.
 */

export type Slot = { day: number; start: string; end: string };

/** Lunes = 0 … domingo = 6 (como guarda la app los horarios de actividades). */
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const join = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/** "Lun y Mié · 18:00 a 19:30": une los días que comparten horario. */
export function scheduleLines(slots: Slot[]): string[] {
  const groups = new Map<string, number[]>();
  for (const s of [...slots].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))) {
    if (!(s.day >= 0 && s.day <= 6) || !s.start || !s.end) continue;
    const key = `${s.start} a ${s.end}`;
    groups.set(key, [...new Set([...(groups.get(key) ?? []), s.day])]);
  }
  return [...groups.entries()]
    .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]) || a[0].localeCompare(b[0]))
    .map(([hours, days]) => `${join(days.sort((x, y) => x - y).map((d) => DAYS[d]))} · ${hours}`);
}

const UNIT: Record<string, string> = { mes: 'por mes', clase: 'por clase', semana: 'por semana', trimestre: 'por trimestre', año: 'por año' };

export function priceLabel(price: number | null | undefined, unit?: string | null) {
  if (price === null || price === undefined || !(price > 0)) return null;
  const amount = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(price);
  return `${amount}${unit && UNIT[unit] ? ` ${UNIT[unit]}` : ''}`;
}

export type ActivityGroup = { name: string; lines: string[]; coaches: string[] };

export type ActivityStoryData = {
  clubName: string;
  logo?: string | null;
  cover?: string | null;
  contact?: string | null;
  title: string;
  emoji?: string | null;
  audience?: string | null;
  highlight?: string | null;
  price?: string | null;
  groups: ActivityGroup[];
};

/** Fuente: disciplina (con sus categorías) o actividad suelta, como las lista la consola. */
export type ActivitySource = {
  id: string;
  name: string;
  emoji?: string | null;
  audience?: string | null;
  coaches?: string[];
  schedule?: Slot[];
  groups?: { name: string; schedule: Slot[]; coaches: string[] }[];
  price?: number | null;
  priceUnit?: string | null;
};

export const MAX_GROUPS = 5;

export function activityStoryGroups(source: ActivitySource, pick?: string[]): ActivityGroup[] {
  const groups = source.groups?.length
    ? source.groups
    : [{ name: '', schedule: source.schedule ?? [], coaches: source.coaches ?? [] }];
  const chosen = pick?.length ? groups.filter((g) => pick.includes(g.name)) : groups;
  return chosen
    .map((g) => ({ name: g.name, lines: scheduleLines(g.schedule), coaches: (g.coaches.length ? g.coaches : (source.coaches ?? [])).slice(0, 3) }))
    .filter((g) => g.lines.length > 0 || g.coaches.length > 0)
    .slice(0, MAX_GROUPS);
}

export function activityCaption(d: Pick<ActivityStoryData, 'clubName' | 'title' | 'highlight' | 'groups' | 'price' | 'contact'>) {
  const lines = [`${d.title} en ${d.clubName}`];
  if (d.highlight) lines.push(d.highlight);
  for (const g of d.groups) {
    lines.push('');
    if (g.name) lines.push(g.name);
    lines.push(...g.lines);
    if (g.coaches.length) lines.push(`Profe: ${g.coaches.join(', ')}`);
  }
  if (d.price) lines.push('', d.price);
  if (d.contact) lines.push('', `Inscripciones: ${d.contact}`);
  return lines.join('\n');
}
