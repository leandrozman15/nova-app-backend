/** Débito automático de la cuota: solo se guarda CÓMO se debita, nunca números de cuenta ni de tarjeta. */
export const AUTO_DEBIT_METHOD_LABEL = 'Débito automático';
export const AUTO_DEBIT_KINDS = ['cbu', 'tarjeta'] as const;
export type AutoDebitKind = (typeof AUTO_DEBIT_KINDS)[number];

export type AutoDebit = {
  active: boolean;
  method: AutoDebitKind;
  /** Referencia para reconocerlo: "Banco Galicia", "Visa terminada en 4417". */
  label: string | null;
  since: string;
};

/** Lo que se muestra: solo si está activo. */
export function autoDebitOf(value: unknown): AutoDebit | null {
  const v = value as Partial<AutoDebit> | null | undefined;
  if (!v || v.active !== true) return null;
  const method = (AUTO_DEBIT_KINDS as readonly string[]).includes(String(v.method))
    ? (v.method as AutoDebitKind)
    : 'cbu';
  return {
    active: true,
    method,
    label: typeof v.label === 'string' && v.label.trim() ? v.label.trim() : null,
    since: typeof v.since === 'string' ? v.since : '',
  };
}

/** ¿La referencia parece un número de cuenta o de tarjeta? (8 o más dígitos seguidos, con o sin separadores) */
export function looksLikeAccountNumber(text: string) {
  return /\d{8,}/.test(text.replace(/[\s.-]/g, ''));
}
