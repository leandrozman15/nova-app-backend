/**
 * Cuota cobrada a mano (efectivo, transferencia, tarjeta) → ingreso en Tesorería.
 * Una sola fila por cuota, con referencia fee:<id>: si la cuota vuelve a pendiente
 * el ingreso se quita, y si cambia el monto se actualiza. Las cobradas por
 * Mercado Pago ya entran como mp:<pago> y no se duplican.
 */

export const FEE_CATEGORY = 'Cuotas sociales';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export type FeeForTreasury = {
  id: string;
  companyId: string;
  clubId: string;
  month: number;
  year: number;
  amount: unknown;
  status: string;
  paymentMethod?: string | null;
  paymentDate?: Date | null;
  mpPaymentId?: string | null;
  player?: { firstName?: string | null; lastName?: string | null } | null;
};

export const feeReference = (feeId: string) => `fee:${feeId}`;

/** Fila de caja que corresponde a la cuota, o null si no tiene que haber ninguna. */
export function feeTreasuryEntry(fee: FeeForTreasury, now = new Date()) {
  if (fee.status !== 'paid' || fee.mpPaymentId) return null;
  const amount = Number(fee.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const who = [fee.player?.lastName, fee.player?.firstName]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const period = `${MONTHS[fee.month - 1] ?? fee.month} ${fee.year}`;
  return {
    companyId: fee.companyId,
    clubId: fee.clubId,
    type: 'income' as const,
    category: FEE_CATEGORY,
    amount,
    occurredAt: fee.paymentDate ?? now,
    description: [`Cuota ${period}`, who, fee.paymentMethod?.trim()]
      .filter(Boolean)
      .join(' · '),
    reference: feeReference(fee.id),
  };
}
