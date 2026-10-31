/**
 * Implantación del staff (entrenadores, coordinadores, administradores y operadores de buffet)
 * desde la plantilla Excel: normaliza y valida cada fila. Sin efectos (fácil de testear).
 */
import { randomInt } from 'node:crypto';

import { fold, parseBirthDate, type Discipline } from '../player-import/player-import.rules';

export type StaffImportRow = {
  /** Número de fila en la planilla (para los mensajes). */
  row: number;
  firstName?: unknown;
  lastName?: unknown;
  dni?: unknown;
  birthDate?: unknown;
  role?: unknown;
  email?: unknown;
  phone?: unknown;
  sport?: unknown;
  specialty?: unknown;
  license?: unknown;
  membershipNumber?: unknown;
  address?: unknown;
  bloodType?: unknown;
  emergencyContact?: unknown;
  emergencyPhone?: unknown;
  parkingIncluded?: unknown;
};

export const STAFF_ROLE_OPTIONS = [
  { code: 'coach_lvl1', label: 'Entrenador Nivel 1 (Jefe de Rama)', aliases: ['entrenador nivel 1', 'entrenador n1', 'jefe de rama', 'coach lvl1', 'coach_lvl1'] },
  { code: 'coach_lvl2', label: 'Entrenador Nivel 2 (Plantel)', aliases: ['entrenador nivel 2', 'entrenador n2', 'entrenador de plantel', 'coach lvl2', 'coach_lvl2'] },
  { code: 'coordinator', label: 'Coordinador de Rama', aliases: ['coordinador', 'coordinadora', 'coordinator'] },
  { code: 'club_admin', label: 'Administrador del Club', aliases: ['administrador', 'administradora', 'admin del club', 'club admin', 'club_admin'] },
  { code: 'buffet', label: 'Operador de Buffet', aliases: ['buffet', 'operador buffet', 'cantina'] },
] as const;
export type StaffRoleCode = (typeof STAFF_ROLE_OPTIONS)[number]['code'];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export type CleanStaff = {
  firstName: string;
  lastName: string;
  dni: string;
  birthDate: string | null;
  role: StaffRoleCode;
  email: string;
  phone: string | null;
  sport: string | null;
  specialty: string | null;
  license: string | null;
  membershipNumber: string | null;
  address: string | null;
  bloodType: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  parkingIncluded: boolean;
};

export type StaffRowResult = {
  row: number;
  status: 'ok' | 'warning' | 'error' | 'duplicate';
  errors: string[];
  warnings: string[];
  staff: CleanStaff | null;
};

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
const text = (v: unknown, max = 120) => {
  const clean = str(v).replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
};
const properName = (v: string) =>
  v.toLocaleLowerCase('es').replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toLocaleUpperCase('es'));
const yes = (v: unknown) => ['si', 'sí', 's', 'yes', 'x', '1', 'true', 'verdadero'].includes(fold(str(v)));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function roleOf(value: unknown): StaffRoleCode | null {
  const k = fold(str(value));
  if (!k) return null;
  const hit = STAFF_ROLE_OPTIONS.find((r) => fold(r.label) === k || fold(r.code) === k || r.aliases.some((a) => fold(a) === k));
  return hit?.code ?? null;
}

/** Valida todas las filas: formato, rol, disciplina y repetidos dentro de la planilla. */
export function validateStaffRows(rows: StaffImportRow[], ctx: { disciplines: Discipline[] }): StaffRowResult[] {
  const seenEmail = new Map<string, number>();
  const seenDni = new Map<string, number>();
  return rows.map((r): StaffRowResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const firstName = text(r.firstName, 60);
    const lastName = text(r.lastName, 60);
    if (!firstName) errors.push('Falta el nombre.');
    if (!lastName) errors.push('Falta el apellido.');

    const dni = str(r.dni).replace(/\D/g, '');
    if (!dni) errors.push('Falta el DNI.');
    else if (dni.length < 6 || dni.length > 10) errors.push(`El DNI "${str(r.dni).trim()}" no es válido (6 a 10 números).`);

    const role = roleOf(r.role);
    if (!str(r.role).trim()) errors.push('Falta el rol.');
    else if (!role) errors.push(`El rol "${str(r.role).trim()}" no existe. Usá uno de la lista.`);

    const email = str(r.email).trim().toLowerCase();
    if (!email) errors.push('Falta el email (es el usuario de acceso).');
    else if (!EMAIL.test(email)) errors.push(`El email "${email}" no es válido.`);

    let birthDate: string | null = null;
    if (str(r.birthDate).trim() !== '' || typeof r.birthDate === 'number') {
      birthDate = parseBirthDate(r.birthDate);
      if (!birthDate) warnings.push('La fecha de nacimiento no se entiende: se deja vacía (usá dd/mm/aaaa).');
    }

    let sport: string | null = null;
    const sportText = text(r.sport);
    if (sportText) {
      const k = fold(sportText);
      const hit = ctx.disciplines.find((d) => fold(d.name) === k || fold(d.sportId) === k);
      if (hit) sport = hit.sportId;
      else warnings.push(`La disciplina "${sportText}" no está cargada en el club: se deja vacía.`);
    }

    let bloodType: string | null = null;
    const blood = str(r.bloodType).trim().toUpperCase().replace(/\s/g, '');
    if (blood) {
      if (BLOOD_TYPES.includes(blood)) bloodType = blood;
      else warnings.push(`El grupo sanguíneo "${str(r.bloodType).trim()}" no es válido: se deja vacío.`);
    }

    if (email) {
      const prev = seenEmail.get(email);
      if (prev) errors.push(`El email está repetido: ya figura en la fila ${prev}.`);
      else seenEmail.set(email, r.row);
    }
    if (dni) {
      const prev = seenDni.get(dni);
      if (prev) errors.push(`El DNI está repetido: ya figura en la fila ${prev}.`);
      else seenDni.set(dni, r.row);
    }

    if (errors.length) return { row: r.row, status: 'error', errors, warnings, staff: null };
    const staff: CleanStaff = {
      firstName: properName(firstName!),
      lastName: properName(lastName!),
      dni,
      birthDate,
      role: role!,
      email,
      phone: text(r.phone, 30),
      sport,
      specialty: text(r.specialty),
      license: text(r.license, 40),
      membershipNumber: text(r.membershipNumber, 30),
      address: text(r.address, 160),
      bloodType,
      emergencyContact: text(r.emergencyContact),
      emergencyPhone: text(r.emergencyPhone, 30),
      parkingIncluded: yes(r.parkingIncluded),
    };
    return { row: r.row, status: warnings.length ? 'warning' : 'ok', errors, warnings, staff };
  });
}

const PASSWORD_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Clave temporal de 10 caracteres (sin letras que se confunden: l, I, O, 0, 1). */
export const tempPassword = () => Array.from({ length: 10 }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join('');

