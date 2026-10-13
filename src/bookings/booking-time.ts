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
