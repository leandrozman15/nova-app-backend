/**
 * Implantación de jugadores desde la plantilla: normaliza y valida cada fila
 * contra las disciplinas y categorías del club. Sin efectos (fácil de testear).
 */

export type ImportRow = {
  /** Número de fila en la planilla (para los mensajes). */
  row: number;
  firstName?: unknown;
  lastName?: unknown;
  dni?: unknown;
  birthDate?: unknown;
  gender?: unknown;
  sport?: unknown;
  category?: unknown;
  branch?: unknown;
  position?: unknown;
  membershipNumber?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  locality?: unknown;
  province?: unknown;
  medicalCert?: unknown;
  minorAuth?: unknown;
  notes?: unknown;
};

export type Discipline = { sportId: string; name: string };
export type Division = { id: string; name: string; sport: string | null };

export type CleanPlayer = {
  firstName: string;
  lastName: string;
  dni: string;
  birthDate: string;
  age: number;
  gender: 'Masculino' | 'Femenino' | 'X';
  sport: string;
  sportName: string;
  divisionId: string | null;
  divisionName: string | null;
  branch: 'masculino' | 'femenino' | 'mixto';
  position: string | null;
  membershipNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  locality: string | null;
  province: string | null;
  hasMedicalCert: boolean;
  hasMinorAuth: boolean;
  notes: string | null;
};

export type RowResult = {
  row: number;
  status: 'ok' | 'warning' | 'error' | 'duplicate';
  errors: string[];
  warnings: string[];
  player: CleanPlayer | null;
};

export const PROVINCES = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
];

/** Formas habituales de escribir algunas provincias. */
const PROVINCE_ALIASES: Record<string, string> = {
  'bs as': 'Buenos Aires',
  bsas: 'Buenos Aires',
  pba: 'Buenos Aires',
  'pcia de buenos aires': 'Buenos Aires',
  'provincia de buenos aires': 'Buenos Aires',
  'capital federal': 'CABA',
  capital: 'CABA',
  'ciudad de buenos aires': 'CABA',
  'ciudad autonoma de buenos aires': 'CABA',
  'tierra del fuego antartida e islas del atlantico sur': 'Tierra del Fuego',
  'stgo del estero': 'Santiago del Estero',
};

/** Minúsculas, sin acentos ni espacios dobles: para comparar nombres. */
export function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto de una celda (números y booleanos incluidos; otros tipos = vacío). */
function str(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}

function text(value: unknown, max = 120): string | null {
  if (value === null || value === undefined) return null;
  const clean = str(value).replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
}

/** "juan carlos" → "Juan Carlos". */
function properName(value: string) {
  return value
    .toLocaleLowerCase('es')
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_, sep: string, letter: string) => sep + letter.toLocaleUpperCase('es'),
    );
}

/**
 * Fecha de nacimiento en cualquiera de los formatos habituales:
 * dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd o número de serie de Excel.
 */
export function parseBirthDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  let y: number, m: number, d: number;
  if (typeof value === 'number' && value > 1000 && value < 80000) {
    // Serie de Excel (días desde 1899-12-30).
    const date = new Date(
      Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000,
    );
    return date.toISOString().slice(0, 10);
  }
  const raw = str(value).trim();
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += y > 30 ? 1900 : 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    return null;
  return date.toISOString().slice(0, 10);
}

export function ageOn(birthDate: string, today: string) {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

function yes(value: unknown) {
  const clean = fold(str(value));
  return ['si', 'sí', 's', 'yes', 'x', '1', 'true', 'verdadero'].includes(
    clean,
  );
}

function gender(value: unknown): CleanPlayer['gender'] | null {
  const clean = fold(str(value));
  if (['m', 'masculino', 'masc', 'hombre', 'varon', 'male'].includes(clean))
    return 'Masculino';
  if (['f', 'femenino', 'fem', 'mujer', 'female'].includes(clean))
    return 'Femenino';
  if (['x', 'otro', 'no binario', 'nb'].includes(clean)) return 'X';
  return null;
}

function branchOf(
  value: unknown,
  sex: CleanPlayer['gender'] | null,
): CleanPlayer['branch'] | null {
  const clean = fold(str(value));
  if (['masculino', 'm', 'masc'].includes(clean)) return 'masculino';
  if (['femenino', 'f', 'fem'].includes(clean)) return 'femenino';
  if (['mixto', 'mixta'].includes(clean)) return 'mixto';
  if (!clean)
    return sex === 'Femenino'
      ? 'femenino'
      : sex === 'Masculino'
        ? 'masculino'
        : 'mixto';
  return null;
}

/** Valida todas las filas: formato, duplicados dentro de la planilla y listas del club. */
export function validateRows(
  rows: ImportRow[],
  context: { disciplines: Discipline[]; divisions: Division[]; today: string },
): RowResult[] {
  const seenDni = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const sports = context.disciplines.map((item) => ({
    ...item,
    keys: [fold(item.sportId), fold(item.name)],
  }));

  return rows.map((input) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const firstName = text(input.firstName, 80);
    const lastName = text(input.lastName, 80);
    if (!firstName) errors.push('Falta el nombre.');
    if (!lastName) errors.push('Falta el apellido.');

    const dni = str(input.dni).replace(/[^\d]/g, '');
    if (!dni) errors.push('Falta el DNI.');
    else if (dni.length < 6 || dni.length > 9)
      errors.push(`DNI inválido (${str(input.dni)}).`);
    else if (seenDni.has(dni))
      errors.push(`DNI repetido en la planilla (fila ${seenDni.get(dni)}).`);
    else seenDni.set(dni, input.row);

    const birthDate = parseBirthDate(input.birthDate);
    let age = 0;
    if (!input.birthDate) errors.push('Falta la fecha de nacimiento.');
    else if (!birthDate)
      errors.push(
        `Fecha de nacimiento inválida (${str(input.birthDate)}): usá dd/mm/aaaa.`,
      );
    else {
      age = ageOn(birthDate, context.today);
      if (age < 2 || age > 95)
        errors.push(`La fecha de nacimiento da ${age} años: revisala.`);
    }

    const sex = gender(input.gender);
    if (!sex)
      errors.push(
        input.gender
          ? `Sexo no reconocido (${str(input.gender)}): Masculino, Femenino o X.`
          : 'Falta el sexo.',
      );

    const sportText = text(input.sport, 60);
    const sport = sportText
      ? sports.find((item) => item.keys.includes(fold(sportText)))
      : undefined;
    if (!sportText) errors.push('Falta el deporte.');
    else if (!sport)
      errors.push(
        `El club no tiene la disciplina "${sportText}". Disciplinas del club: ${context.disciplines.map((item) => item.name).join(', ') || 'ninguna cargada'}.`,
      );

    let division: Division | undefined;
    const categoryText = text(input.category, 60);
    if (categoryText && sport) {
      const options = context.divisions.filter(
        (item) => !item.sport || fold(item.sport) === fold(sport.sportId),
      );
      division = options.find((item) => fold(item.name) === fold(categoryText));
      if (!division)
        warnings.push(
          `No existe la categoría "${categoryText}" en ${sport.name}: queda sin categoría.${options.length ? ` Categorías: ${options.map((item) => item.name).join(', ')}.` : ''}`,
        );
    }

    const branch = branchOf(input.branch, sex);
    if (!branch)
      errors.push(
        `Rama no reconocida (${str(input.branch)}): Masculino, Femenino o Mixto.`,
      );

    let email = text(input.email, 160)?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push(`Email inválido (${email}): se importa sin email.`);
      email = null;
    } else if (email && seenEmail.has(email)) {
      warnings.push(
        `Email repetido en la planilla (fila ${seenEmail.get(email)}): se importa sin email.`,
      );
      email = null;
    } else if (email) seenEmail.set(email, input.row);

    let province = text(input.province, 40);
    if (province) {
      const key = fold(province).replace(/[.]/g, '');
      const match =
        PROVINCES.find((item) => fold(item) === key) ?? PROVINCE_ALIASES[key];
      if (match) province = match;
      else
        warnings.push(
          `Provincia no reconocida (${province}): se guarda tal cual.`,
        );
    }

    if (age > 0 && age < 18 && !yes(input.minorAuth))
      warnings.push(
        'Es menor de edad y no figura la autorización de los padres.',
      );

    const player: CleanPlayer | null =
      errors.length === 0
        ? {
            firstName: properName(firstName!),
            lastName: properName(lastName!),
            dni,
            birthDate: birthDate!,
            age,
            gender: sex!,
            sport: sport!.sportId,
            sportName: sport!.name,
            divisionId: division?.id ?? null,
            divisionName: division?.name ?? null,
            branch: branch!,
            position: text(input.position, 60),
            membershipNumber: text(input.membershipNumber, 30),
            email,
            phone: text(input.phone, 40),
            address: text(input.address, 160),
            locality: text(input.locality, 80),
            province,
            hasMedicalCert: yes(input.medicalCert),
            hasMinorAuth: yes(input.minorAuth),
            notes: text(input.notes, 500),
          }
        : null;

    return {
      row: input.row,
      status: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
      errors,
      warnings,
      player,
    };
  });
}
