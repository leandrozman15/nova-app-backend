export const PAYMENT_METHODS = ['cash', 'mercadopago', 'transfer', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BUFFET_MODES = ['own', 'canon', 'percent', 'none'] as const;
export type BuffetMode = (typeof BUFFET_MODES)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function saleTotal(items: { quantity: number; unitPrice: number }[]): number {
  return round2(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0));
}

/** Efectivo esperado en caja: fondo inicial + ventas en efectivo (las anuladas no cuentan). */
export function expectedCash(openingAmount: number, cashSales: number): number {
  return round2(openingAmount + cashSales);
}

/**
 * Importe que el cierre de caja informa a Tesorería según el modo del buffet.
 * own: el total vendido · percent: % del total (tercerizado) · canon/none: nada en el cierre
 * (el canon se registra aparte, una vez por período).
 */
export function treasuryAmountForClose(mode: BuffetMode, salesTotal: number, percent?: number | null): number {
  if (mode === 'own') return round2(salesTotal);
  if (mode === 'percent') return round2((salesTotal * (percent ?? 0)) / 100);
  return 0;
}

export function treasuryCategory(mode: BuffetMode): string {
  return mode === 'percent' ? 'Buffet - participación en ventas' : 'Buffet - ventas';
}
