/** Cupos de atletas y packs del plan de un club. Sin efectos: fácil de testear. */

export type PlanTerms = {
  monthlyPrice: number;
  includedAthletes: number;
  extraBlockSize: number;
  extraBlockPrice: number;
  buffetPackPrice: number;
  integrationsPackPrice: number;
};

export type ClubTerms = {
  extraBlocks: number;
  buffetPack: boolean;
  integrationsPack: boolean;
  customPrice: number | null;
};

export type PriceBreakdown = {
  base: number;
  extras: number;
  buffet: number;
  integrations: number;
  /** Suma de lo anterior (lo que corresponde por el plan). */
  listTotal: number;
  /** Lo que paga el club: el precio pactado si hay, si no la suma. */
  total: number;
};

/** Atletas activos que permite el plan: los incluidos más los bloques extra. */
export function athleteLimit(
  plan: Pick<PlanTerms, 'includedAthletes' | 'extraBlockSize'>,
  club: Pick<ClubTerms, 'extraBlocks'>,
) {
  return (
    plan.includedAthletes + Math.max(0, club.extraBlocks) * plan.extraBlockSize
  );
}

export function priceBreakdown(
  plan: PlanTerms,
  club: ClubTerms,
): PriceBreakdown {
  const base = plan.monthlyPrice;
  const extras = Math.max(0, club.extraBlocks) * plan.extraBlockPrice;
  const buffet = club.buffetPack ? plan.buffetPackPrice : 0;
  const integrations = club.integrationsPack ? plan.integrationsPackPrice : 0;
  const listTotal = base + extras + buffet + integrations;
  return {
    base,
    extras,
    buffet,
    integrations,
    listTotal,
    total: club.customPrice ?? listTotal,
  };
}

/** Bloques extra que necesita un club con esta cantidad de atletas activos. */
export function blocksNeeded(
  plan: Pick<PlanTerms, 'includedAthletes' | 'extraBlockSize'>,
  athletes: number,
) {
  if (athletes <= plan.includedAthletes) return 0;
  return Math.ceil(
    (athletes - plan.includedAthletes) / Math.max(1, plan.extraBlockSize),
  );
}

/** Mensaje si sumar `adding` atletas supera el cupo; null si entran. */
export function seatsProblem(
  limit: number,
  active: number,
  adding: number,
): string | null {
  if (adding <= 0 || active + adding <= limit) return null;
  const free = Math.max(0, limit - active);
  return free === 0
    ? `El plan del club permite ${limit} atletas activos y ya están todos ocupados. Pedile a Fluxion que sume cupo.`
    : `El plan del club permite ${limit} atletas activos: quedan ${free} lugares y se quieren sumar ${adding}. Pedile a Fluxion que sume cupo.`;
}
