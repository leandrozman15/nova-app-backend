/**
 * Profes: reglas sin efectos (horarios libres, packs, saldo del alumno, validaciones).
 * Días de la semana: 0 = domingo … 6 = sábado (igual que la agenda de canchas).
 */

export const COACH_FORMATS = ['INDIVIDUAL', 'DUO', 'GROUP'] as const;
export type CoachFormat = (typeof COACH_FORMATS)[number];

/** Niveles de pádel (de menor a mayor). */
export const PADEL_LEVELS = [
  'iniciacion',
  '8va',
  '7ma',
  '6ta',
  '5ta',
  '4ta',
  '3ra',
  '2da',
  '1ra',
] as const;

/** Cupo por formato: individual 1, dúo 2, grupal entre 3 y 12. */
export function capacityFor(format: CoachFormat, requested?: number) {
  if (format === 'INDIVIDUAL') return 1;
  if (format === 'DUO') return 2;
  return Math.min(12, Math.max(3, Math.round(requested ?? 4)));
}

/** Slug para el link público: "Juan Pérez" → "juan-perez". */
export function slugify(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'profe'
  );
}

export type Interval = { start: number; end: number };
const overlaps = (a: Interval, b: Interval) =>
  a.start < b.end && b.start < a.end;

export type AvailabilityWindow = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  clubId?: string | null;
  facilityId?: string | null;
  locationText?: string | null;
  /** Franja en el club sin cancha fija: cualquiera de estas canchas que esté libre. */
  anyOf?: string[];
};

/** Franjas del mismo día que se pisan (no se permiten). */
export function availabilityProblem(
  windows: Omit<AvailabilityWindow, 'id'>[],
): string | null {
  for (const w of windows) {
    if (!(w.weekday >= 0 && w.weekday <= 6)) return 'Día inválido.';
    if (!(
      w.startMinute >= 0 &&
      w.endMinute <= 1440 &&
      w.endMinute > w.startMinute
    ))
      return 'Cada franja tiene que terminar después de empezar.';
    if (w.startMinute % 15 || w.endMinute % 15)
      return 'Usá horarios cada 15 minutos.';
  }
  for (let i = 0; i < windows.length; i++)
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i];
      const b = windows[j];
      if (
        a.weekday === b.weekday &&
        overlaps(
          { start: a.startMinute, end: a.endMinute },
          { start: b.startMinute, end: b.endMinute },
        )
      )
        return 'Hay dos franjas del mismo día que se pisan.';
    }
  return null;
}

export type FreeSlot = {
  startMinute: number;
  availabilityId: string;
  clubId: string | null;
  facilityId: string | null;
  locationText: string | null;
};

/**
 * Horarios libres de un día para una clase de `duration` minutos:
 * dentro de las franjas del profe, sin pisar sus clases ni sus bloqueos,
 * sin pisar la cancha ocupada (si la franja tiene cancha) y con anticipación mínima.
 */
export function freeSlotsForDay(o: {
  weekday: number;
  windows: AvailabilityWindow[];
  duration: number;
  busy: Interval[];
  courtBusy?: Record<string, Interval[]>;
  /** Minuto actual si el día es hoy (se exige `leadMinutes` de anticipación). */
  nowMinute?: number | null;
  leadMinutes?: number;
  step?: number;
}): FreeSlot[] {
  const step = o.step ?? 30;
  const lead = o.leadMinutes ?? 120;
  const out: FreeSlot[] = [];
  for (const w of o.windows
    .filter((x) => x.weekday === o.weekday)
    .sort((a, b) => a.startMinute - b.startMinute)) {
    for (
      let start = w.startMinute;
      start + o.duration <= w.endMinute;
      start += step
    ) {
      const slot = { start, end: start + o.duration };
      if (
        o.nowMinute !== null &&
        o.nowMinute !== undefined &&
        start < o.nowMinute + lead
      )
        continue;
      if (o.busy.some((b) => overlaps(b, slot))) continue;
      if (
        w.facilityId &&
        (o.courtBusy?.[w.facilityId] ?? []).some((b) => overlaps(b, slot))
      )
        continue;
      // Sin cancha fija en el club: hace falta al menos una cancha libre.
      let facilityId = w.facilityId ?? null;
      if (!facilityId && w.anyOf) {
        facilityId =
          w.anyOf.find(
            (id) => !(o.courtBusy?.[id] ?? []).some((b) => overlaps(b, slot)),
          ) ?? null;
        if (!facilityId) continue;
      }
      if (out.some((s) => s.startMinute === start)) continue;
      out.push({
        startMinute: start,
        availabilityId: w.id,
        clubId: w.clubId ?? null,
        facilityId,
        locationText: w.locationText ?? null,
      });
    }
  }
  return out;
}

/** ¿El horario pedido sigue libre? Devuelve la franja que lo contiene. */
export function slotStillFree(
  o: Parameters<typeof freeSlotsForDay>[0],
  startMinute: number,
) {
  return (
    freeSlotsForDay({ ...o, step: 15 }).find(
      (s) => s.startMinute === startMinute,
    ) ?? null
  );
}

export type PackLike = {
  id: string;
  totalClasses: number;
  usedClasses: number;
  expiresAt?: string | null;
  createdAt: Date | string;
};

/** Pack del que se descuenta una clase de la fecha dada: el más viejo con clases y sin vencer. */
export function packToUse<T extends PackLike>(
  packs: T[],
  date: string,
): T | null {
  return (
    [...packs]
      .filter(
        (p) =>
          p.usedClasses < p.totalClasses &&
          (!p.expiresAt || p.expiresAt >= date),
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )[0] ?? null
  );
}

const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

/** Saldo del alumno: lo que falta pagar de packs y de clases sueltas, y clases que le quedan. */
export function studentBalance(o: {
  packs: {
    totalClasses: number;
    usedClasses: number;
    price: unknown;
    paidAmount: unknown;
  }[];
  unpaidLessons: { price: unknown }[];
}) {
  const packsDue = money(
    o.packs.reduce(
      (s, p) => s + Math.max(0, money(p.price) - money(p.paidAmount)),
      0,
    ),
  );
  const lessonsDue = money(
    o.unpaidLessons.reduce((s, l) => s + money(l.price), 0),
  );
  return {
    packsDue,
    lessonsDue,
    total: money(packsDue + lessonsDue),
    classesLeft: o.packs.reduce(
      (s, p) => s + Math.max(0, p.totalClasses - p.usedClasses),
      0,
    ),
  };
}

/** ¿Se puede pedir esta clase? Mensaje de error o null. */
export function requestProblem(o: {
  date: string;
  today: string;
  maxDays?: number;
  startMinute: number;
  duration: number;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return 'Fecha inválida.';
  if (o.date < o.today) return 'Esa fecha ya pasó.';
  const max = o.maxDays ?? 60;
  const limit = new Date(`${o.today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + max);
  if (new Date(`${o.date}T00:00:00Z`) > limit)
    return `Se puede pedir con hasta ${max} días de anticipación.`;
  if (!(o.startMinute >= 0 && o.startMinute + o.duration <= 1440))
    return 'Horario inválido.';
  return null;
}

/** Golpes que se evalúan en la ficha del alumno de pádel (1 a 5). */
export const PADEL_SKILLS = [
  'drive',
  'reves',
  'volea_drive',
  'volea_reves',
  'bandeja',
  'vibora',
  'remate',
  'globo',
  'saque',
  'salida_pared',
  'posicionamiento',
] as const;

/** Deja solo golpes conocidos con nota entera de 1 a 5 (o null si no queda ninguno). */
export function cleanSkills(input: unknown): Record<string, number> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, number> = {};
  for (const key of PADEL_SKILLS) {
    const value = Number((input as Record<string, unknown>)[key]);
    if (Number.isInteger(value) && value >= 1 && value <= 5) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** Roles de la consola que se vinculan a su propio club sin esperar aprobación. */
export const CLUB_STAFF_ROLES = [
  'coach',
  'coach_lvl1',
  'coach_lvl2',
  'coordinator',
  'manager',
  'club_admin',
  'admin',
];

/**
 * Canchas de pádel del club: las marcadas como pádel por deporte, tipo, etiqueta o nombre
 * (estén o no habilitadas para reservas online). Nunca las de otros deportes.
 */
export function padelCourts(
  facilities: {
    id: string;
    sport?: string | null;
    type?: string | null;
    typeLabel?: string | null;
    name?: string | null;
  }[],
) {
  const isPadel = (v?: string | null) => /p[aá]del/i.test(v ?? '');
  return facilities
    .filter(
      (f) =>
        isPadel(f.sport) ||
        isPadel(f.type) ||
        isPadel(f.typeLabel) ||
        (!f.sport && isPadel(f.name)),
    )
    .map((f) => f.id);
}
