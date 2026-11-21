/**
 * Estado de turnos libres: qué rangos libres tiene cada cancha hoy y mañana.
 * Sin efectos: fácil de testear. El dibujo está en story-render.ts.
 */
import { addDays, minuteLabel, todayIn } from '../bookings/booking-time';

export type Cell = {
  start: number;
  end: number;
  status: 'free' | 'taken' | 'past';
};
export type Range = { start: number; end: number };

/** Turno mínimo que vale la pena mostrar (minutos). */
export const MIN_FREE_MINUTES = 60;
export const MAX_FACILITIES = 6;
export const MAX_RANGES = 6;

/** Une las franjas libres consecutivas en rangos ("18:00 a 21:00") y descarta los cortos. */
export function freeRanges(
  cells: Cell[],
  minMinutes = MIN_FREE_MINUTES,
): Range[] {
  const ranges: Range[] = [];
  for (const c of [...cells].sort((a, b) => a.start - b.start)) {
    if (c.status !== 'free') continue;
    const last = ranges[ranges.length - 1];
    if (last && c.start <= last.end) last.end = Math.max(last.end, c.end);
    else ranges.push({ start: c.start, end: c.end });
  }
  return ranges.filter((r) => r.end - r.start >= minMinutes);
}

export const rangeLabel = (r: Range) =>
  `${minuteLabel(r.start)} a ${minuteLabel(r.end)}`;

const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/** "Hoy · viernes 20/11", "Mañana · sábado 21/11". */
export function dayTitle(date: string, index: number) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const prefix = index === 0 ? 'Hoy' : index === 1 ? 'Mañana' : '';
  return `${prefix ? `${prefix} · ` : ''}${wd} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Días que muestra el estado: hoy y mañana en la zona del club. */
export function storyDates(timeZone: string, now = new Date()) {
  const today = todayIn(timeZone, now);
  return [today, addDays(today, 1)];
}

export type StoryFacility = { name: string; ranges: Range[] };
export type StoryDay = {
  date: string;
  title: string;
  facilities: StoryFacility[];
};

export type StoryData = {
  clubName: string;
  logo?: string | null;
  cover?: string | null;
  contact?: string | null;
  days: StoryDay[];
};

/** Deja solo lo que entra en la imagen: hasta 6 canchas y 6 rangos por cancha. */
export function trimStory(days: StoryDay[]): StoryDay[] {
  return days.map((d) => ({
    ...d,
    facilities: d.facilities
      .slice(0, MAX_FACILITIES)
      .map((f) => ({ ...f, ranges: f.ranges.slice(0, MAX_RANGES) })),
  }));
}

export const hasFreeTime = (days: StoryDay[]) =>
  days.some((d) => d.facilities.some((f) => f.ranges.length > 0));

/** Texto que acompaña la historia o el aviso. */
export function storyCaption(
  data: Pick<StoryData, 'clubName' | 'days' | 'contact'>,
) {
  const lines = [`Turnos libres en ${data.clubName}`];
  for (const d of data.days) {
    const free = d.facilities.filter((f) => f.ranges.length);
    if (!free.length) continue;
    lines.push('', d.title);
    for (const f of free)
      lines.push(`${f.name}: ${f.ranges.map(rangeLabel).join(', ')}`);
  }
  if (data.contact) lines.push('', `Reservas: ${data.contact}`);
  return lines.join('\n');
}
