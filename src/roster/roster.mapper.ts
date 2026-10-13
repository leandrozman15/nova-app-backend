/**
 * Padrón del club en Postgres con la misma forma que tenían las fichas de
 * Firestore, para que la consola cambie de fuente sin rehacer cada pantalla.
 * Los campos sin columna propia viajan en `extra` y se devuelven tal cual.
 */
import type { ClubDiscipline, Division, Player, Prisma } from '@prisma/client';

export type Doc = Record<string, unknown>;

export function str(value: unknown, max = 500): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

export function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'si' || value === 'sí') return true;
  if (value === 'false' || value === 'no') return false;
  return null;
}

export function int(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(str(value) ?? NaN);
  return Number.isInteger(number) ? number : null;
}

export function isoDay(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : '';
}

/** "2011-05-03", "03/05/2011", ISO completo o Timestamp de Firestore → fecha (mediodía UTC). */
export function parseDay(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = str(value, 40);
  if (!raw) return null;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let y: number, m: number, d: number;
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

function plain(value: unknown): unknown {
  // Timestamps de Firestore y fechas → texto ISO; lo demás tal cual (JSON).
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function')
      return (value as { toDate: () => Date }).toDate().toISOString();
    if (Array.isArray(value)) return value.map(plain);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, plain(item)]),
    );
  }
  return value;
}

function extraOf(value: Prisma.JsonValue | null): Doc {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

/** Separa los campos conocidos (columnas) del resto (extra). */
function split(fields: Doc, known: Set<string>, ignored: Set<string>) {
  const own: Doc = {};
  const extra: Doc = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ignored.has(key) || value === undefined) continue;
    if (known.has(key)) own[key] = value;
    else extra[key] = plain(value);
  }
  return { own, extra };
}

// ─── Jugadores ───────────────────────────────────────────────────────────────

const PLAYER_TEXT = [
  'firstName',
  'lastName',
  'dni',
  'email',
  'phone',
  'address',
  'locality',
  'province',
  'photoUrl',
  'position',
  'sport',
  'divisionId',
  'branch',
  'gender',
  'membershipNumber',
  'status',
  'role',
  'notes',
  'authUid',
  'membershipTier',
  'membershipCategory',
  'paymentMethod',
] as const;
const PLAYER_BOOL = [
  'hasMedicalCert',
  'hasMinorAuth',
  'isFan',
  'active',
] as const;
const PLAYER_KNOWN = new Set<string>([
  ...PLAYER_TEXT,
  ...PLAYER_BOOL,
  'birthDate',
  'uid',
]);
// Calculados o de solo lectura: no se guardan.
const PLAYER_IGNORED = new Set<string>([
  'id',
  'backendId',
  'divisionName',
  'clubId',
  'clubName',
  'companyId',
  'roles',
  'createdAt',
  'updatedAt',
  'legacyId',
  'extra',
  'password',
]);

export type PlayerWithDivision = Player & {
  division?: { name: string } | null;
};

/** Ficha del jugador con la forma de Firestore (id = el que ya usa la consola). */
export function toPlayerDoc(player: PlayerWithDivision): Doc {
  const extra = extraOf(player.extra);
  return {
    ...extra,
    id: player.legacyId ?? player.id,
    backendId: player.id,
    clubId: player.clubId,
    firstName: player.firstName,
    lastName: player.lastName,
    dni: player.dni ?? '',
    email: player.email ?? '',
    phone: player.phone ?? '',
    address: player.address ?? '',
    locality: player.locality ?? '',
    province: player.province ?? '',
    photoUrl: player.photoUrl ?? '',
    position: player.position ?? '',
    birthDate: isoDay(player.birthDate),
    sport: player.sport ?? '',
    divisionId:
      player.divisionId ??
      (typeof extra.divisionId === 'string' ? extra.divisionId : ''),
    divisionName:
      player.division?.name ??
      (typeof extra.divisionName === 'string' ? extra.divisionName : ''),
    branch: player.branch ?? '',
    gender: player.gender ?? '',
    membershipNumber: player.membershipNumber ?? '',
    hasMedicalCert: player.hasMedicalCert,
    hasMinorAuth: player.hasMinorAuth,
    isFan: player.isFan,
    status: player.status,
    role: player.role ?? (player.isFan ? 'member' : 'player'),
    roles: [player.role ?? (player.isFan ? 'member' : 'player')],
    notes: player.notes ?? '',
    membershipTier: player.membershipTier ?? '',
    membershipCategory: player.membershipCategory ?? '',
    paymentMethod: player.paymentMethod ?? '',
    authUid: player.authUid ?? '',
    uid: player.authUid ?? '',
    active: player.active,
    // El equipo sigue en Firestore hasta la etapa 2.
    teamId: typeof extra.teamId === 'string' ? extra.teamId : '',
    teamName: typeof extra.teamName === 'string' ? extra.teamName : '',
    createdAt: player.createdAt.toISOString(),
    updatedAt: player.updatedAt.toISOString(),
  };
}

/** Campos de la consola → datos de Prisma. `previousExtra` se combina (no se pisa). */
export function playerData(
  fields: Doc,
  previousExtra: Prisma.JsonValue | null = null,
) {
  const { own, extra } = split(fields, PLAYER_KNOWN, PLAYER_IGNORED);
  const data: Record<string, unknown> = {};
  for (const key of PLAYER_TEXT) {
    if (!(key in own)) continue;
    const value = str(
      own[key],
      key === 'photoUrl' || key === 'notes' ? 2_000_000 : 300,
    );
    if (key === 'firstName' || key === 'lastName') {
      if (value) data[key] = value;
    } else if (key === 'email') data.email = value ? value.toLowerCase() : null;
    else if (key === 'dni')
      data.dni = value ? value.replace(/\D/g, '') || null : null;
    else if (key === 'status') data.status = value ?? 'active';
    else data[key] = value;
  }
  if ('uid' in own && !('authUid' in own)) data.authUid = str(own.uid, 128);
  for (const key of PLAYER_BOOL) {
    if (!(key in own)) continue;
    const value = bool(own[key]);
    if (value !== null) data[key] = value;
  }
  if ('birthDate' in own) data.birthDate = parseDay(own.birthDate);
  const merged = { ...extraOf(previousExtra), ...extra };
  if (Object.keys(extra).length > 0) data.extra = merged;
  return data;
}

// ─── Disciplinas ─────────────────────────────────────────────────────────────

const DISCIPLINE_TEXT = [
  'sportId',
  'name',
  'emoji',
  'season',
  'coordinatorId',
  'coordinatorName',
  'location',
  'gender',
  'description',
  'status',
] as const;
const DISCIPLINE_KNOWN = new Set<string>([
  ...DISCIPLINE_TEXT,
  'customName',
  'minAge',
  'maxAge',
]);
const DISCIPLINE_IGNORED = new Set<string>([
  'id',
  'clubId',
  'companyId',
  'createdAt',
  'updatedAt',
  'extra',
]);

export function toDisciplineDoc(discipline: ClubDiscipline): Doc {
  return {
    ...extraOf(discipline.extra),
    id: discipline.id,
    clubId: discipline.clubId,
    sportId: discipline.sportId,
    name: discipline.name,
    customName: discipline.name,
    emoji: discipline.emoji ?? '',
    season: discipline.season ?? '',
    coordinatorId: discipline.coordinatorId ?? '',
    coordinatorName: discipline.coordinatorName ?? '',
    location: discipline.location ?? '',
    gender: discipline.gender ?? 'both',
    minAge: discipline.minAge ?? '',
    maxAge: discipline.maxAge ?? '',
    description: discipline.description ?? '',
    status: discipline.status,
    createdAt: discipline.createdAt.toISOString(),
    updatedAt: discipline.updatedAt.toISOString(),
  };
}

export function disciplineData(
  fields: Doc,
  previousExtra: Prisma.JsonValue | null = null,
) {
  const { own, extra } = split(fields, DISCIPLINE_KNOWN, DISCIPLINE_IGNORED);
  const data: Record<string, unknown> = {};
  for (const key of DISCIPLINE_TEXT) {
    if (!(key in own)) continue;
    const value = str(own[key], key === 'description' ? 3000 : 120);
    if (key === 'name' || key === 'sportId') {
      if (value) data[key] = value;
    } else if (key === 'status') data.status = value ?? 'active';
    else data[key] = value;
  }
  if ('customName' in own && str(own.customName))
    data.name = str(own.customName, 120);
  if ('minAge' in own) data.minAge = int(own.minAge);
  if ('maxAge' in own) data.maxAge = int(own.maxAge);
  if (Object.keys(extra).length > 0)
    data.extra = {
      ...extraOf(previousExtra),
      ...extra,
    };
  return data;
}

// ─── Ramas ───────────────────────────────────────────────────────────────────

const DIVISION_TEXT = [
  'sport',
  'name',
  'branch',
  'coordinatorId',
  'headCoachId',
  'status',
] as const;
const DIVISION_KNOWN = new Set<string>([...DIVISION_TEXT, 'minAge', 'maxAge']);
const DIVISION_IGNORED = new Set<string>([
  'id',
  'clubId',
  'companyId',
  'createdAt',
  'updatedAt',
  'extra',
]);

export function toDivisionDoc(division: Division): Doc {
  return {
    ...extraOf(division.extra),
    id: division.id,
    clubId: division.clubId,
    sport: division.sport ?? '',
    name: division.name,
    branch: division.branch ?? '',
    minAge: division.minAge,
    maxAge: division.maxAge,
    coordinatorId: division.coordinatorId ?? '',
    headCoachId: division.headCoachId ?? '',
    status: division.status,
    createdAt: division.createdAt.toISOString(),
    updatedAt: division.updatedAt.toISOString(),
  };
}

export function divisionData(
  fields: Doc,
  previousExtra: Prisma.JsonValue | null = null,
) {
  const { own, extra } = split(fields, DIVISION_KNOWN, DIVISION_IGNORED);
  const data: Record<string, unknown> = {};
  for (const key of DIVISION_TEXT) {
    if (!(key in own)) continue;
    const value = str(own[key], 120);
    if (key === 'name') {
      if (value) data.name = value;
    } else if (key === 'status') data.status = value ?? 'active';
    else data[key] = value;
  }
  if ('minAge' in own) data.minAge = int(own.minAge);
  if ('maxAge' in own) data.maxAge = int(own.maxAge);
  if (Object.keys(extra).length > 0)
    data.extra = {
      ...extraOf(previousExtra),
      ...extra,
    };
  return data;
}

export { plain };
