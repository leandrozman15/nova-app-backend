/**
 * Recordatorios de turnos de alquiler: textos y ventana de envío.
 * Sin efectos: fácil de testear.
 */
import { minuteLabel } from '../bookings/booking-time';

/** Cuánto antes del turno sale el recordatorio automático. */
export const REMIND_BEFORE_MS = 3 * 60 * 60 * 1000;
/** No se avisa si falta menos que esto (ya no sirve). */
export const MIN_LEAD_MS = 20 * 60 * 1000;

/** ¿Corresponde mandar ahora el recordatorio automático de este turno? */
export function dueForPush(startsAt: Date, now = new Date()) {
  const left = startsAt.getTime() - now.getTime();
  return left <= REMIND_BEFORE_MS && left >= MIN_LEAD_MS;
}

export const timeRange = (startMinute: number, duration: number) =>
  `${minuteLabel(startMinute)} a ${minuteLabel(startMinute + duration)}`;

/** "hoy" si el turno es de hoy en la zona del club; si no, "el 21/11". */
export function whenLabel(date: string, today: string) {
  if (date === today) return 'hoy';
  const [, m, d] = date.split('-');
  return `el ${d}/${m}`;
}

export type ReminderInput = {
  clubName: string;
  facilityName: string;
  date: string;
  today: string;
  startMinute: number;
  durationMinutes: number;
  contactName?: string | null;
};

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || '';

/** Push al que reservó desde la app. */
export function pushReminder(r: ReminderInput) {
  return {
    title: `Tu turno ${whenLabel(r.date, r.today)} a las ${minuteLabel(r.startMinute)}`,
    body: `${r.facilityName} en ${r.clubName}, de ${timeRange(r.startMinute, r.durationMinutes)}. ¡Te esperamos!`,
  };
}

/** Mensaje de WhatsApp que manda el club ("Recordá que hoy tenés alquilada…"). */
export function whatsappReminder(r: ReminderInput) {
  const name = firstName(r.contactName);
  return `Hola${name ? ` ${name}` : ''}! Te escribimos de ${r.clubName}. Recordá que ${whenLabel(r.date, r.today)} tenés alquilada ${r.facilityName} de ${timeRange(r.startMinute, r.durationMinutes)} hs. ¡Te esperamos! Si no podés venir, avisanos así liberamos el turno.`;
}
