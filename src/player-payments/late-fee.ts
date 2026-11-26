/** Mora de cuotas vencidas: se calcula al vuelo según la configuración del club. */
export type LateFeeConfig = {
  mode: 'off' | 'daily' | 'fixed';
  /** daily: % mensual (se prorratea por día sobre 30). fixed: % único. */
  percent: number;
  /** Días después del vencimiento en que todavía no se cobra mora. */
  graceDays: number;
  /** Tope del recargo en % de la cuota (null = sin tope). */
  maxPercent: number | null;
};

export const NO_LATE_FEE: LateFeeConfig = {
  mode: 'off',
  percent: 0,
  graceDays: 0,
  maxPercent: null,
};

export type LateFee = {
  /** Días corridos desde el vencimiento (0 si no venció). */
  daysLate: number;
  /** % aplicado (0 si todavía no corresponde). */
  percent: number;
  /** Intereses en pesos. */
  amount: number;
  /** Cuota + intereses. */
  total: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** AAAA-MM-DD de un instante en una zona horaria. */
export function dayInZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Último día del mes de la cuota: vence ahí si no tiene fecha. */
export function defaultDueDay(month: number, year: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/**
 * Intereses de una cuota pendiente al día de hoy.
 * - fixed: el % completo, una sola vez, pasados los días de gracia.
 * - daily: el % mensual prorrateado por día (simple, sin interés sobre interés) por cada día después de la gracia.
 */
export function computeLateFee(
  fee: {
    amount: number;
    month: number;
    year: number;
    dueDate?: Date | string | null;
  },
  config: LateFeeConfig,
  now: Date = new Date(),
  timeZone = 'America/Argentina/Buenos_Aires',
): LateFee {
  const base = round2(fee.amount);
  const dueDay = fee.dueDate
    ? new Date(fee.dueDate).toISOString().slice(0, 10)
    : defaultDueDay(fee.month, fee.year);
  const daysLate = Math.max(
    0,
    dayNumber(dayInZone(now, timeZone)) - dayNumber(dueDay),
  );
  const none = { daysLate, percent: 0, amount: 0, total: base };
  if (config.mode === 'off' || !(config.percent > 0) || !(base > 0))
    return none;
  const chargeable = daysLate - Math.max(0, config.graceDays);
  if (chargeable <= 0) return none;
  let percent =
    config.mode === 'fixed'
      ? config.percent
      : (config.percent / 30) * chargeable;
  if (config.maxPercent !== null && config.maxPercent >= 0)
    percent = Math.min(percent, config.maxPercent);
  percent = round2(percent);
  const amount = round2((base * percent) / 100);
  return { daysLate, percent, amount, total: round2(base + amount) };
}

/** Configuración a partir de la fila del club (los Decimal de Prisma llegan como objetos). */
export function lateFeeConfigOf(
  club:
    | {
        lateFeeMode?: string | null;
        lateFeePercent?: unknown;
        lateFeeGraceDays?: number | null;
        lateFeeMaxPercent?: unknown;
      }
    | null
    | undefined,
): LateFeeConfig {
  if (!club) return NO_LATE_FEE;
  const mode =
    club.lateFeeMode === 'daily' || club.lateFeeMode === 'fixed'
      ? club.lateFeeMode
      : 'off';
  const max =
    club.lateFeeMaxPercent == null ? null : Number(club.lateFeeMaxPercent);
  return {
    mode,
    percent: Number(club.lateFeePercent ?? 0),
    graceDays: club.lateFeeGraceDays ?? 0,
    maxPercent: max !== null && Number.isFinite(max) ? max : null,
  };
}

export const LATE_FEE_CLUB_SELECT = {
  timezone: true,
  lateFeeMode: true,
  lateFeePercent: true,
  lateFeeGraceDays: true,
  lateFeeMaxPercent: true,
} as const;
