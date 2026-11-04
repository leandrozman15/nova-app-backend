/** Reglas puras de los programas del municipio (sin base de datos, fáciles de probar). */

export const PROGRAM_STATUSES = ['open', 'closed'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

/** Día de clase en formato AAAA-MM-DD y que exista en el calendario. */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Quedan lugares si no hay cupo definido o todavía no se llenó. */
export function hasRoom(
  capacity: number | null | undefined,
  activeCount: number,
): boolean {
  return capacity === null || capacity === undefined || activeCount < capacity;
}

/** Porcentaje de presentes (0-100, entero); null si todavía no se tomó asistencia. */
export function attendanceRate(present: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((present / total) * 100);
}

/** Solo dígitos del DNI; vacío si no hay. */
export function normalizeDni(dni: string | null | undefined): string | null {
  const digits = (dni ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}
