import { computeLateFee } from '../player-payments/late-fee';
import type { LateFeeConfig } from '../player-payments/late-fee';

export type Light = 'green' | 'yellow' | 'red';
export type Reason = { code: string; message: string };
export type MedicalState = 'missing' | 'expired' | 'soon' | 'ok';

export type UnpaidFee = {
  amount: number;
  month: number;
  year: number;
  dueDate?: Date | string | null;
};

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
/** Días antes del vencimiento en que se avisa (amarillo). */
export const WARN_DAYS = 2;

const money = (n: number) =>
  `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/**
 * Semáforo de la puerta. Rojo: legajo inactivo, cuota vencida o apto vencido.
 * Amarillo: cuota que vence en 48 h, apto por vencer o sin cargar. Verde: todo al día.
 */
export function evaluateAccess(input: {
  active: boolean;
  fees: UnpaidFee[];
  lateFee: LateFeeConfig;
  medical: MedicalState;
  now?: Date;
  timeZone?: string;
  today: string;
}): { result: Light; reasons: Reason[]; owed: number; overdueMonths: string[] } {
  const now = input.now ?? new Date();
  const red: Reason[] = [];
  const yellow: Reason[] = [];
  let owed = 0;
  const overdueMonths: string[] = [];

  if (!input.active)
    red.push({ code: 'inactive', message: 'Legajo inactivo: consultar en administración' });

  const sorted = [...input.fees].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month),
  );
  for (const fee of sorted) {
    const late = computeLateFee(fee, input.lateFee, now, input.timeZone);
    const name = `${MONTHS[fee.month - 1] ?? fee.month} ${fee.year}`;
    if (late.daysLate > 0) {
      owed += late.total;
      overdueMonths.push(name);
      continue;
    }
    // Todavía no venció: avisa solo si vence en los próximos días.
    const dueDay = fee.dueDate
      ? new Date(fee.dueDate).toISOString().slice(0, 10)
      : null;
    const left = dueDay ? dayNumber(dueDay) - dayNumber(input.today) : null;
    if (left !== null && left <= WARN_DAYS)
      yellow.push({
        code: 'fee_due_soon',
        message:
          left <= 0
            ? `La cuota de ${name} vence hoy`
            : `La cuota de ${name} vence en ${left} ${left === 1 ? 'día' : 'días'}`,
      });
  }
  if (overdueMonths.length)
    red.unshift({
      code: 'fee_overdue',
      message: `Cuota ${overdueMonths.join(', ')} pendiente: ${money(owed)}`,
    });

  if (input.medical === 'expired')
    red.push({ code: 'medical_expired', message: 'Apto físico vencido' });
  else if (input.medical === 'soon')
    yellow.push({ code: 'medical_soon', message: 'El apto físico está por vencer: renovarlo' });
  else if (input.medical === 'missing')
    yellow.push({ code: 'medical_missing', message: 'Falta cargar el apto físico' });

  const result: Light = red.length ? 'red' : yellow.length ? 'yellow' : 'green';
  return {
    result,
    reasons: [...red, ...yellow],
    owed: Math.round(owed * 100) / 100,
    overdueMonths,
  };
}
