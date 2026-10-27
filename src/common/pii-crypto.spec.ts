import {
  decryptExtra,
  decryptJson,
  decryptPii,
  dniHash,
  encryptExtra,
  encryptJson,
  encryptPii,
  isEncrypted,
} from './pii-crypto';
import { encryptPersonData } from '../prisma/pii-extension';
import { pendingFields } from '../prisma/pii-backfill.service';

describe('pii-crypto', () => {
  const original = process.env.PII_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
  });
  afterAll(() => {
    process.env.PII_ENCRYPTION_KEY = original;
  });

  it('cifra y descifra, con IV distinto cada vez', () => {
    const a = encryptPii('12345678');
    const b = encryptPii('12345678');
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toContain('12345678');
    expect(a).not.toEqual(b);
    expect(decryptPii(a)).toBe('12345678');
  });

  it('devuelve tal cual el dato viejo en claro y no cifra dos veces', () => {
    expect(decryptPii('texto viejo')).toBe('texto viejo');
    const a = encryptPii('x');
    expect(encryptPii(a)).toBe(a);
  });

  it('detecta datos alterados', () => {
    const a = encryptPii('secreto');
    const tampered = a.slice(0, -2) + (a.endsWith('AA') ? 'BB' : 'AA');
    expect(() => decryptPii(tampered)).toThrow();
  });

  it('falla cerrado si no hay clave', () => {
    const key = process.env.PII_ENCRYPTION_KEY;
    delete process.env.PII_ENCRYPTION_KEY;
    expect(() => encryptPii('x')).toThrow('PII_ENCRYPTION_KEY');
    process.env.PII_ENCRYPTION_KEY = key;
  });

  it('el índice ciego ignora puntos y no revela el DNI', () => {
    expect(dniHash('12.345.678')).toBe(dniHash('12345678'));
    expect(dniHash('12345678')).not.toContain('12345678');
    expect(dniHash('')).toBeNull();
    expect(dniHash(null)).toBeNull();
  });

  it('extra: cifra lo personal y deja en claro lo operativo', () => {
    const enc = encryptExtra({
      teamId: 't1',
      guardianEmail: 'a@b.c',
      guardianDni: '999',
      health: { allergy: 'penicilina' },
    }) as Record<string, unknown>;
    expect(enc.teamId).toBe('t1');
    expect(enc.guardianEmail).toBe('a@b.c');
    expect(isEncrypted(enc.guardianDni)).toBe(true);
    expect(JSON.stringify(enc)).not.toContain('penicilina');
    expect(decryptExtra(enc)).toEqual({
      teamId: 't1',
      guardianEmail: 'a@b.c',
      guardianDni: '999',
      health: { allergy: 'penicilina' },
    });
  });

  it('JSON completo (familiares) ida y vuelta', () => {
    const enc = encryptJson([{ name: 'Mamá' }]);
    expect(JSON.stringify(enc)).not.toContain('Mamá');
    expect(decryptJson(enc)).toEqual([{ name: 'Mamá' }]);
  });
});

describe('encryptPersonData', () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
  });

  it('mueve la fecha de nacimiento a la columna cifrada y calcula el hash del DNI', () => {
    const out = encryptPersonData(
      {
        firstName: 'Ana',
        dni: '12.345.678',
        birthDate: new Date('2016-05-10T12:00:00Z'),
        phone: '1155',
        notes: null,
      },
      true,
    );
    expect(out.firstName).toBe('Ana');
    expect(out.birthDate).toBeNull();
    expect(decryptPii(out.birthDateEnc)).toBe('2016-05-10T12:00:00.000Z');
    expect(out.dniHash).toBe(dniHash('12345678'));
    expect(decryptPii(out.dni)).toBe('12.345.678');
    expect(decryptPii(out.phone)).toBe('1155');
    expect(out.notes).toBeNull();
  });

  it('respeta los valores { set } y los null', () => {
    const out = encryptPersonData(
      { phone: { set: '999' }, birthDate: null, dni: null },
      false,
    );
    expect(decryptPii(out.phone.set)).toBe('999');
    expect(out.birthDateEnc).toBeNull();
    expect(out.dniHash).toBeNull();
  });
});

describe('pendingFields', () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
  });

  it('solo marca lo que sigue en claro', () => {
    expect(
      pendingFields({ dni: encryptPii('1'), dniHash: 'h', birthDate: null, phone: encryptPii('2'), extra: { teamId: 't' } }, true),
    ).toBeNull();
    expect(pendingFields({ dni: '123', dniHash: null, phone: encryptPii('2') }, true)).toEqual({ dni: '123' });
  });
});
