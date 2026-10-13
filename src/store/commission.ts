/**
 * Comisiones de la tienda.
 * - X (platformPercent): lo que Fluxion descuenta al vendedor. Se resuelve comercio > club > global.
 * - Y (clubPercent): parte de X que va al club de retiro. Se resuelve club > global.
 * - Siempre Y ≤ X, en cualquier combinación de comercio y club.
 */

export type RuleRow = {
  id: string;
  scope: 'GLOBAL' | 'CLUB' | 'MERCHANT';
  clubId: string | null;
  merchantId: string | null;
  platformPercent: number | null;
  clubPercent: number | null;
  version: number;
};

export type Limits = {
  platformMin: number;
  platformMax: number;
  clubMin: number;
  clubMax: number;
};

export type ResolvedRates = {
  platformPercent: number;
  clubPercent: number;
  rules: {
    platform: { id: string; scope: RuleRow['scope']; version: number };
    club: { id: string; scope: RuleRow['scope']; version: number } | null;
  };
};

export class CommissionConflict extends Error {}

const ref = (rule: RuleRow) => ({
  id: rule.id,
  scope: rule.scope,
  version: rule.version,
});

/** Reglas vigentes agrupadas por alcance. */
export function indexRules(rules: RuleRow[]) {
  const global = rules.find((rule) => rule.scope === 'GLOBAL') ?? null;
  const clubs = new Map<string, RuleRow>();
  const merchants = new Map<string, RuleRow>();
  for (const rule of rules) {
    if (rule.scope === 'CLUB' && rule.clubId) clubs.set(rule.clubId, rule);
    if (rule.scope === 'MERCHANT' && rule.merchantId)
      merchants.set(rule.merchantId, rule);
  }
  return { global, clubs, merchants };
}

/**
 * Porcentajes para una venta. `merchantId` null = venta propia del club
 * (el club es el vendedor, así que no recibe parte como punto de retiro).
 */
export function resolveRates(
  rules: RuleRow[],
  context: { merchantId: string | null; clubId: string },
): ResolvedRates {
  const { global, clubs, merchants } = indexRules(rules);
  if (!global) throw new Error('Falta la regla global de comisiones');
  const club = clubs.get(context.clubId);
  const merchant = context.merchantId
    ? merchants.get(context.merchantId)
    : undefined;

  const platformRule =
    (merchant?.platformPercent != null && merchant) ||
    (club?.platformPercent != null && club) ||
    global;
  const platformPercent = Number(platformRule.platformPercent);

  if (!context.merchantId) {
    return {
      platformPercent,
      clubPercent: 0,
      rules: { platform: ref(platformRule), club: null },
    };
  }

  const clubRule = (club?.clubPercent != null && club) || global;
  const clubPercent = Number(clubRule.clubPercent);
  if (clubPercent > platformPercent) {
    // No debería pasar (se valida al guardar), pero nunca se le da al club más de lo cobrado.
    throw new CommissionConflict(
      'La configuración de comisiones es inconsistente para esta venta.',
    );
  }
  return {
    platformPercent,
    clubPercent,
    rules: { platform: ref(platformRule), club: ref(clubRule) },
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Reparto de una venta en pesos (redondeo a centavos; el vendedor absorbe la diferencia). */
export function split(
  subtotal: number,
  platformPercent: number,
  clubPercent: number,
) {
  const platformAmount = round2((subtotal * platformPercent) / 100);
  const clubAmount = Math.min(
    platformAmount,
    round2((subtotal * clubPercent) / 100),
  );
  return {
    subtotal: round2(subtotal),
    platformAmount,
    clubAmount,
    fluxionAmount: round2(platformAmount - clubAmount),
    sellerAmount: round2(subtotal - platformAmount),
  };
}

export type Names = {
  club: (id: string) => string;
  merchant: (id: string) => string;
};

/**
 * Valida un conjunto de reglas vigentes: rangos permitidos y Y ≤ X en toda
 * combinación comercio × club. Devuelve el primer problema encontrado.
 */
export function findConflict(
  rules: RuleRow[],
  limits: Limits,
  names: Names,
): string | null {
  const { global, clubs, merchants } = indexRules(rules);
  if (!global) return 'Falta la regla global.';

  const describe = (rule: RuleRow) =>
    rule.scope === 'GLOBAL'
      ? 'el valor general'
      : rule.scope === 'CLUB'
        ? `el club ${names.club(rule.clubId!)}`
        : `el comercio ${names.merchant(rule.merchantId!)}`;

  for (const rule of rules) {
    if (
      rule.platformPercent != null &&
      (rule.platformPercent < limits.platformMin ||
        rule.platformPercent > limits.platformMax)
    )
      return `La comisión de Fluxion para ${describe(rule)} (${rule.platformPercent}%) está fuera del rango permitido (${limits.platformMin}% a ${limits.platformMax}%).`;
    if (
      rule.clubPercent != null &&
      (rule.clubPercent < limits.clubMin || rule.clubPercent > limits.clubMax)
    )
      return `La parte del club para ${describe(rule)} (${rule.clubPercent}%) está fuera del rango permitido (${limits.clubMin}% a ${limits.clubMax}%).`;
  }

  // Contextos de club: el general y cada club con regla propia.
  const contexts: Array<{
    y: number;
    yRule: RuleRow;
    x: number;
    xRule: RuleRow;
    label: string;
  }> = [
    {
      y: Number(global.clubPercent),
      yRule: global,
      x: Number(global.platformPercent),
      xRule: global,
      label: 'los clubes sin valor propio',
    },
  ];
  for (const club of clubs.values()) {
    const yRule = club.clubPercent != null ? club : global;
    const xRule = club.platformPercent != null ? club : global;
    contexts.push({
      y: Number(yRule.clubPercent),
      yRule,
      x: Number(xRule.platformPercent),
      xRule,
      label: `el club ${names.club(club.clubId!)}`,
    });
  }

  for (const context of contexts) {
    if (context.y > context.x)
      return `Para ${context.label}, la parte del club (${context.y}%, ${describe(context.yRule)}) supera la comisión de Fluxion (${context.x}%, ${describe(context.xRule)}).`;
    for (const merchant of merchants.values()) {
      const x = Number(merchant.platformPercent);
      if (context.y > x)
        return `${capitalize(context.label)} recibe ${context.y}% y el comercio ${names.merchant(merchant.merchantId!)} paga ${x}%: el club no puede recibir más de lo que paga el comercio.`;
    }
  }
  return null;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
