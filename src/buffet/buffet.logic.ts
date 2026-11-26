export const PAYMENT_METHODS = ['cash', 'mercadopago', 'transfer', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BUFFET_MODES = ['own', 'canon', 'percent', 'none'] as const;
export type BuffetMode = (typeof BUFFET_MODES)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Un cobro: cuánto se pagó con qué medio. Una venta o una cuenta puede llevar varios. */
export type PaymentLine = { method: string; amount: number };

/** Une los cobros del mismo medio y descarta los de monto cero, conservando el orden en que se cargaron. */
export function mergePayments(lines: PaymentLine[]): PaymentLine[] {
  const out: PaymentLine[] = [];
  for (const l of lines) {
    const amount = round2(l.amount);
    if (!(amount > 0)) continue;
    const prev = out.find((o) => o.method === l.method);
    if (prev) prev.amount = round2(prev.amount + amount);
    else out.push({ method: l.method, amount });
  }
  return out;
}

export const sumPayments = (lines: PaymentLine[]) => round2(lines.reduce((a, l) => a + l.amount, 0));

/** Medio que se guarda en la venta: el único usado, o "mixed" si se pagó con varios. */
export function saleMethodOf(lines: PaymentLine[]): string {
  return lines.length === 1 ? lines[0].method : 'mixed';
}

/**
 * Saca `amount` del fondo de cobros (en orden) y devuelve de qué medios salió. Modifica el fondo.
 * Sirve para repartir lo que pagó el cliente entre los consumos y el saldo de la cancha.
 */
export function takeFromPool(pool: PaymentLine[], amount: number): PaymentLine[] {
  const taken: PaymentLine[] = [];
  let need = round2(amount);
  for (const p of pool) {
    if (need <= 0) break;
    if (p.amount <= 0) continue;
    const part = round2(Math.min(p.amount, need));
    p.amount = round2(p.amount - part);
    need = round2(need - part);
    taken.push({ method: p.method, amount: part });
  }
  return mergePayments(taken);
}

/** Lo que falta pagar de la cancha (precio menos lo ya cobrado: seña y pagos). Nunca negativo. */
export function courtBalance(price: number, paid: number): number {
  return Math.max(0, round2(price - paid));
}

/** Medios con los que se paga un turno en la agenda (efectivo, transferencia, otro). */
export function bookingMethodOf(lines: PaymentLine[]): 'cash' | 'transfer' | 'other' {
  const main = [...lines].sort((a, b) => b.amount - a.amount)[0]?.method;
  return main === 'cash' ? 'cash' : main === 'transfer' ? 'transfer' : 'other';
}

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


/** Producto tal como lo ve una familia: sin costo ni cantidades de stock. */
export type PublicMenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string | null;
  available: boolean;
};

export function toPublicMenu(
  products: { id: string; name: string; category: string; price: unknown; imageUrl: string | null; stock: number; trackStock: boolean; active: boolean }[],
): PublicMenuItem[] {
  return products
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: Number(p.price),
      imageUrl: p.imageUrl,
      available: !p.trackStock || p.stock > 0,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
