import { Prisma } from '@prisma/client';

import {
  dniHash,
  decryptExtra,
  decryptJson,
  decryptOptional,
  decryptPii,
  encryptExtra,
  encryptJson,
  encryptOptional,
  encryptPii,
} from '../common/pii-crypto';

type Data = Record<string, any>;

const TEXT_FIELDS = ['phone', 'address', 'locality', 'notes'] as const;

const isPlainObject = (value: unknown): value is Data =>
  !!value &&
  typeof value === 'object' &&
  Object.getPrototypeOf(value) === Object.prototype;

/** Prisma admite `campo: valor` o `campo: { set: valor }`. */
function unwrap(value: unknown): { wrapped: boolean; inner: unknown } {
  if (isPlainObject(value) && 'set' in value)
    return { wrapped: true, inner: value.set };
  return { wrapped: false, inner: value };
}
const rewrap = (wrapped: boolean, value: unknown) =>
  wrapped ? { set: value } : value;

/** Cifra los campos personales de un `data` de create/update (Player o Member). */
export function encryptPersonData(data: Data, hasExtra: boolean): Data {
  if (!isPlainObject(data)) return data;
  const out: Data = { ...data };

  for (const field of TEXT_FIELDS) {
    if (!(field in out)) continue;
    const { wrapped, inner } = unwrap(out[field]);
    if (typeof inner === 'string' || inner === null)
      out[field] = rewrap(wrapped, encryptOptional(inner as string | null));
  }

  if ('dni' in out) {
    const { wrapped, inner } = unwrap(out.dni);
    if (typeof inner === 'string' || inner === null) {
      out.dni = rewrap(wrapped, encryptOptional(inner as string | null));
      out.dniHash = rewrap(wrapped, dniHash(inner as string | null));
    }
  }

  if ('birthDate' in out) {
    const { wrapped, inner } = unwrap(out.birthDate);
    if (inner instanceof Date || typeof inner === 'string' || inner === null) {
      const date =
        inner === null
          ? null
          : inner instanceof Date
            ? inner
            : new Date(inner);
      out.birthDateEnc = rewrap(
        wrapped,
        date && !Number.isNaN(date.getTime())
          ? encryptPii(date.toISOString())
          : null,
      );
      out.birthDate = rewrap(wrapped, null);
    }
  }

  if ('familyMembers' in out) {
    const { wrapped, inner } = unwrap(out.familyMembers);
    if (Array.isArray(inner) || isPlainObject(inner))
      out.familyMembers = rewrap(wrapped, encryptJson(inner));
  }

  if (hasExtra && 'extra' in out) {
    const { wrapped, inner } = unwrap(out.extra);
    if (isPlainObject(inner)) out.extra = rewrap(wrapped, encryptExtra(inner));
  }
  return out;
}

const encryptMany = (data: unknown, hasExtra: boolean) =>
  Array.isArray(data)
    ? data.map((row) => encryptPersonData(row as Data, hasExtra))
    : encryptPersonData(data as Data, hasExtra);

function personQuery(hasExtra: boolean) {
  const run = async ({ args, query }: { args: any; query: (a: any) => any }) => {
    if (args.data) args.data = encryptMany(args.data, hasExtra);
    if (args.create) args.create = encryptMany(args.create, hasExtra);
    if (args.update) args.update = encryptMany(args.update, hasExtra);
    return query(args);
  };
  return {
    create: run,
    createMany: run,
    createManyAndReturn: run,
    update: run,
    updateMany: run,
    upsert: run,
  };
}

const birthDateOf = (row: { birthDate: Date | null; birthDateEnc: string | null }) =>
  row.birthDateEnc ? new Date(decryptPii(row.birthDateEnc)) : row.birthDate;

const personResult = (hasExtra: boolean) => ({
  dni: { needs: { dni: true }, compute: (r: any) => decryptOptional(r.dni) },
  phone: { needs: { phone: true }, compute: (r: any) => decryptOptional(r.phone) },
  address: { needs: { address: true }, compute: (r: any) => decryptOptional(r.address) },
  locality: { needs: { locality: true }, compute: (r: any) => decryptOptional(r.locality) },
  notes: { needs: { notes: true }, compute: (r: any) => decryptOptional(r.notes) },
  birthDate: {
    needs: { birthDate: true, birthDateEnc: true },
    compute: (r: any) => birthDateOf(r),
  },
  familyMembers: {
    needs: { familyMembers: true },
    compute: (r: any) => decryptJson(r.familyMembers),
  },
  ...(hasExtra
    ? { extra: { needs: { extra: true }, compute: (r: any) => decryptExtra(r.extra) } }
    : {}),
});

/**
 * Cifra/descifra los datos personales de jugadores, socios y lesiones sin que
 * el resto del código lo note: escribe cifrado y lee en claro.
 */
export const piiExtension = Prisma.defineExtension({
  name: 'pii-encryption',
  query: {
    player: personQuery(true) as any,
    member: personQuery(false) as any,
    injuryReport: {
      async create({ args, query }: any) {
        if (typeof args.data?.description === 'string')
          args.data.description = encryptPii(args.data.description);
        return query(args);
      },
      async update({ args, query }: any) {
        const { wrapped, inner } = unwrap(args.data?.description);
        if (typeof inner === 'string')
          args.data.description = rewrap(wrapped, encryptPii(inner));
        return query(args);
      },
    } as any,
  },
  result: {
    player: personResult(true) as any,
    member: personResult(false) as any,
    injuryReport: {
      description: {
        needs: { description: true },
        compute: (r: any) => decryptPii(r.description),
      },
    } as any,
  },
});
