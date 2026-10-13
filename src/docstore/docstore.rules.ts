/**
 * Reglas del almacén de documentos (lo que antes eran las reglas de Firestore),
 * más las consultas en memoria. Sin efectos: fácil de testear.
 */

export type Viewer = {
  uid: string;
  role: string | null;
  clubId: string | null;
  companyId: string;
};

export type Filter = { field: string; op: string; value: unknown };
export type Order = { field: string; direction: 'asc' | 'desc' };

/** Roles que ven y editan todo el club (como canManageClub en Firestore). */
export const STAFF_ROLES = new Set([
  'admin',
  'fed_admin',
  'league_admin',
  'municipal_admin',
  'municipal_secretary',
  'municipal_inspector',
  'manager',
  'club_admin',
  'coordinator',
  'coach',
  'coach_lvl1',
  'coach_lvl2',
]);

/** Roles con alcance en toda la institución (no solo su club activo). */
export const COMPANY_ROLES = new Set([
  'admin',
  'fed_admin',
  'league_admin',
  'municipal_admin',
  'municipal_secretary',
  'municipal_inspector',
]);

/** Lo que socios y jugadores pueden leer de su club. */
export const MEMBER_READABLE = new Set([
  'special_events',
  'standings',
  'matches',
  'opponents',
  'tournaments',
  'facilities',
]);

/** Colecciones que ya viven en tablas propias (etapa 1): no van por el almacén. */
export const ROSTER_COLLECTIONS = new Set(['players', 'available_disciplines']);

/** Colecciones de primer nivel atadas a un club por su campo clubId. */
export const CLUB_TOP_LEVEL = new Set([
  'users',
  'match_callups',
  'live_matches_index',
  'special_events',
]);

export type PathInfo =
  | {
      kind: 'club';
      clubId: string;
      top: string | null;
      isDoc: boolean;
      segments: string[];
    }
  | {
      kind: 'club-field';
      collection: string;
      isDoc: boolean;
      segments: string[];
    }
  | { kind: 'company'; collection: string; isDoc: boolean; segments: string[] };

const SEGMENT = /^[A-Za-z0-9_\-.@:]{1,160}$/;

export function parsePath(path: string): PathInfo | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 12) return null;
  if (
    !segments.every(
      (segment) => SEGMENT.test(segment) && segment !== '.' && segment !== '..',
    )
  )
    return null;
  const isDoc = segments.length % 2 === 0;
  if (segments[0] === 'clubs') {
    if (segments.length < 2) return null;
    const top = segments[2] ?? null;
    return { kind: 'club', clubId: segments[1], top, isDoc, segments };
  }
  if (CLUB_TOP_LEVEL.has(segments[0]))
    return { kind: 'club-field', collection: segments[0], isDoc, segments };
  return { kind: 'company', collection: segments[0], isDoc, segments };
}

/** Rutas del padrón (etapa 1) que ya no se sirven desde acá. */
export function isRosterPath(info: PathInfo) {
  if (info.kind !== 'club' || !info.top) return false;
  const depth = info.segments.length;
  if (ROSTER_COLLECTIONS.has(info.top)) return depth <= 4; // la colección o una ficha (sus subcolecciones sí)
  if (info.top === 'divisions') return depth <= 4; // la rama en sí; sus planteles sí
  return false;
}

export const isStaff = (viewer: Viewer) =>
  STAFF_ROLES.has((viewer.role ?? '').toLowerCase());
const isCompanyWide = (viewer: Viewer) =>
  COMPANY_ROLES.has((viewer.role ?? '').toLowerCase());

/** ¿El usuario pertenece (o tiene alcance) a ese club? La empresa del club se valida aparte. */
export function inClub(viewer: Viewer, clubId: string | null | undefined) {
  if (!clubId) return false;
  return isCompanyWide(viewer) || viewer.clubId === clubId;
}

export function canRead(viewer: Viewer, clubId: string, top: string | null) {
  if (!inClub(viewer, clubId)) return false;
  if (isStaff(viewer)) return true;
  if (top === null) return true; // la ficha del club
  return MEMBER_READABLE.has(top);
}

export function canWrite(viewer: Viewer, clubId: string) {
  return inClub(viewer, clubId) && isStaff(viewer);
}

// ─── Consultas ───────────────────────────────────────────────────────────────

function read(data: Record<string, unknown>, field: string): unknown {
  let value: unknown = data;
  for (const key of field.split('.')) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

const same = (a: unknown, b: unknown) =>
  a === b ||
  (a !== null &&
    b !== null &&
    typeof a === 'object' &&
    JSON.stringify(a) === JSON.stringify(b));

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean')
    return Number(a) - Number(b);
  const text = (value: unknown) =>
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? `${value}`
        : JSON.stringify(value);
  return text(a).localeCompare(text(b));
}

export function matches(
  data: Record<string, unknown>,
  filter: Filter,
): boolean {
  const value =
    filter.field === '__name__' ? data.__id : read(data, filter.field);
  const target = filter.value;
  switch (filter.op) {
    case '==':
      return same(value, target);
    case '!=':
      return value !== undefined && !same(value, target);
    case '<':
      return value !== undefined && compare(value, target) < 0;
    case '<=':
      return value !== undefined && compare(value, target) <= 0;
    case '>':
      return value !== undefined && compare(value, target) > 0;
    case '>=':
      return value !== undefined && compare(value, target) >= 0;
    case 'in':
      return Array.isArray(target) && target.some((item) => same(value, item));
    case 'not-in':
      return (
        Array.isArray(target) &&
        value !== undefined &&
        !target.some((item) => same(value, item))
      );
    case 'array-contains':
      return Array.isArray(value) && value.some((item) => same(item, target));
    case 'array-contains-any':
      return (
        Array.isArray(value) &&
        Array.isArray(target) &&
        value.some((item) => target.some((wanted) => same(item, wanted)))
      );
    default:
      return false;
  }
}

export type Row = { id: string; path: string; data: Record<string, unknown> };

export function runQuery(
  rows: Row[],
  filters: Filter[],
  orders: Order[],
  limit?: number,
) {
  let list = rows.filter((row) =>
    filters.every((filter) => matches({ ...row.data, __id: row.id }, filter)),
  );
  // Como Firestore: ordenar por un campo deja afuera los documentos sin ese campo.
  for (const order of orders)
    list = list.filter((row) => read(row.data, order.field) !== undefined);
  if (orders.length > 0) {
    list = [...list].sort((a, b) => {
      for (const order of orders) {
        const result = compare(
          read(a.data, order.field),
          read(b.data, order.field),
        );
        if (result !== 0) return order.direction === 'desc' ? -result : result;
      }
      return 0;
    });
  } else {
    list = [...list].sort((a, b) => a.id.localeCompare(b.id));
  }
  return typeof limit === 'number' ? list.slice(0, Math.max(0, limit)) : list;
}

// ─── Escrituras ──────────────────────────────────────────────────────────────

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** setDoc(..., { merge: true }): combina mapas anidados. */
export function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] =
      isPlain(value) && isPlain(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out;
}

/** updateDoc: claves con punto ("stats.goals") tocan solo ese campo anidado. */
export function applyUpdate(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const out: Record<string, unknown> = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('.');
    let target = out;
    for (const part of parts.slice(0, -1)) {
      if (!isPlain(target[part])) target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts.at(-1)!] = value;
  }
  return out;
}

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function autoId() {
  let id = '';
  for (let i = 0; i < 20; i += 1)
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return id;
}
