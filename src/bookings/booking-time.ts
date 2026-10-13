/** Utilidades de fecha en la zona horaria del club (sin dependencias). */

export const BOOKING_HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // turnos de 08 a 23 (el último termina a las 00)
export const BOOKING_WINDOW_DAYS = 14;
const DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Fecha local (YYYY-MM-DD) de "ahora" en la zona del club. */
export function todayIn(timeZone: string, now = new Date()) {
  const { year, month, day } = partsIn(now, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDays(value, 0) === value;
}

/** Instante UTC de "date hour:00" en la zona del club (maneja horario de verano). */
export function zonedToUtc(date: string, hour: number, timeZone: string) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  // Diferencia entre lo que muestra la zona para `guess` y el valor buscado.
  const shown = partsIn(new Date(guess), timeZone);
  const shownUtc = Date.UTC(
    shown.year,
    shown.month - 1,
    shown.day,
    shown.hour,
    shown.minute,
    shown.second,
  );
  return new Date(guess - (shownUtc - guess));
}

/** Abreviatura del día ("Lun", "Mar"...) usada por la grilla de alquileres fijos. */
export function dayAbbr(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return DAY_ABBR[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Ventana reservable: hoy y los próximos días, en la zona del club. */
export function bookingWindow(timeZone: string, now = new Date()) {
  const first = todayIn(timeZone, now);
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, index) =>
    addDays(first, index),
  );
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

// ─── Turnos por minutos ─────────────────────────────────────────────────────

/** Los turnos arrancan cada 30 minutos. */
export const SLOT_STEP_MINUTES = 30;
export const ALLOWED_DURATIONS = [30, 60, 90, 120] as const;

/** Instante UTC de "date + minute" (minuto desde las 00:00; 1440 = medianoche siguiente). */
export function zonedMinuteToUtc(
  date: string,
  minute: number,
  timeZone: string,
) {
  if (minute >= 1440)
    return new Date(
      zonedToUtc(addDays(date, 1), 0, timeZone).getTime() +
        (minute - 1440) * 60_000,
    );
  return new Date(
    zonedToUtc(date, Math.floor(minute / 60), timeZone).getTime() +
      (minute % 60) * 60_000,
  );
}

/** "21:30"; 1440 se muestra como "00:00". */
export function minuteLabel(minute: number) {
  const value = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Minuto actual del día en la zona del club. */
export function nowMinuteIn(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return get('hour') * 60 + get('minute');
}

export type TimeStatus = 'free' | 'taken' | 'past';

/**
 * Horarios de inicio posibles para una duración: cada 30 min entre la apertura
 * y el cierre, ocupado si se pisa con algún turno activo.
 */
export function computeTimes(options: {
  open: number;
  close: number;
  duration: number;
  taken: Array<[number, number]>;
  /** Minuto actual si la fecha es hoy; null si es un día futuro. */
  nowMinute: number | null;
}) {
  const times: Array<{
    start: number;
    end: number;
    label: string;
    status: TimeStatus;
  }> = [];
  for (
    let start = Math.ceil(options.open / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
    start + options.duration <= options.close;
    start += SLOT_STEP_MINUTES
  ) {
    const end = start + options.duration;
    const status: TimeStatus =
      options.nowMinute !== null && start <= options.nowMinute
        ? 'past'
        : options.taken.some(([from, to]) => start < to && from < end)
          ? 'taken'
          : 'free';
    times.push({ start, end, label: minuteLabel(start), status });
  }
  return times;
}
