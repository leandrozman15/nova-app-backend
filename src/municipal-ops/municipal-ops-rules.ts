export const DOCUMENT_KINDS = ['statute', 'legal_status', 'insurance', 'habilitation', 'other'] as const;
/** Documentación que el municipio exige a cada institución. */
export const REQUIRED_KINDS = ['statute', 'legal_status', 'insurance', 'habilitation'] as const;
export const REQUEST_TYPES = ['subsidy', 'materials', 'facility', 'other'] as const;
export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'delivered'] as const;

export type DocStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry';
const DAY = 86_400_000;
export const EXPIRING_DAYS = 30;

export function documentStatus(expiresAt: Date | null | undefined, now = new Date()): DocStatus {
  if (!expiresAt) return 'no_expiry';
  const left = expiresAt.getTime() - now.getTime();
  if (left < 0) return 'expired';
  return left <= EXPIRING_DAYS * DAY ? 'expiring' : 'valid';
}

export type DocLike = { kind: string; expiresAt: Date | null };
export type Compliance = {
  /** ok = todo lo exigido vigente; warning = algo por vencer; alert = vencido o faltante */
  level: 'ok' | 'warning' | 'alert';
  missing: string[];
  expired: string[];
  expiring: string[];
};

/** Para cada documento exigido toma el más vigente de su tipo. */
export function complianceFor(docs: DocLike[], now = new Date()): Compliance {
  const missing: string[] = [];
  const expired: string[] = [];
  const expiring: string[] = [];
  for (const kind of REQUIRED_KINDS) {
    const ofKind = docs.filter((d) => d.kind === kind);
    if (ofKind.length === 0) { missing.push(kind); continue; }
    const rank = (d: DocLike) => (d.expiresAt ? d.expiresAt.getTime() : Number.MAX_SAFE_INTEGER);
    const best = ofKind.reduce((a, b) => (rank(b) > rank(a) ? b : a));
    const st = documentStatus(best.expiresAt, now);
    if (st === 'expired') expired.push(kind);
    else if (st === 'expiring') expiring.push(kind);
  }
  const level = missing.length || expired.length ? 'alert' : expiring.length ? 'warning' : 'ok';
  return { level, missing, expired, expiring };
}

const NEXT: Record<string, string[]> = {
  pending: ['approved', 'rejected'],
  approved: ['delivered', 'rejected'],
  rejected: [],
  delivered: [],
};
export const canMoveRequest = (from: string, to: string) => (NEXT[from] ?? []).includes(to);

export type CalendarItem = {
  id: string;
  type: 'match' | 'booking' | 'swim' | 'program';
  title: string;
  start: string;
  end: string | null;
  place: string | null;
  clubId: string | null;
};

/** Ordena por inicio y descarta lo que no entra en la ventana pedida. */
export function sortCalendar(items: CalendarItem[], from: Date, to: Date): CalendarItem[] {
  return items
    .filter((i) => { const t = Date.parse(i.start); return !Number.isNaN(t) && t >= from.getTime() && t <= to.getTime(); })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
