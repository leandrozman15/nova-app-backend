import {
  findConflict,
  resolveRates,
  split,
  type Limits,
  type RuleRow,
} from './commission';
import { isValidCuit } from './store-categories';
import { startOfToday } from './store-orders.service';

const limits: Limits = {
  platformMin: 0,
  platformMax: 30,
  clubMin: 0,
  clubMax: 15,
};
const names = { club: (id: string) => id, merchant: (id: string) => id };

const rule = (partial: Partial<RuleRow> & Pick<RuleRow, 'scope'>): RuleRow => ({
  id: `${partial.scope}-${partial.clubId ?? partial.merchantId ?? 'g'}`,
  clubId: null,
  merchantId: null,
  platformPercent: null,
  clubPercent: null,
  version: 1,
  ...partial,
});

const global = rule({ scope: 'GLOBAL', platformPercent: 6, clubPercent: 2 });

describe('comisiones de la tienda', () => {
  it('resolves X merchant > club > global and Y club > global', () => {
    const rules = [
      global,
      rule({ scope: 'CLUB', clubId: 'c1', platformPercent: 5, clubPercent: 3 }),
      rule({ scope: 'MERCHANT', merchantId: 'm1', platformPercent: 8 }),
    ];
    expect(
      resolveRates(rules, { merchantId: 'm1', clubId: 'c1' }),
    ).toMatchObject({
      platformPercent: 8,
      clubPercent: 3,
      rules: { platform: { scope: 'MERCHANT' }, club: { scope: 'CLUB' } },
    });
    expect(
      resolveRates(rules, { merchantId: 'm2', clubId: 'c1' }),
    ).toMatchObject({
      platformPercent: 5,
      clubPercent: 3,
    });
    expect(
      resolveRates(rules, { merchantId: 'm2', clubId: 'c9' }),
    ).toMatchObject({
      platformPercent: 6,
      clubPercent: 2,
      rules: { platform: { scope: 'GLOBAL' }, club: { scope: 'GLOBAL' } },
    });
  });

  it('a club rule with only Y inherits X from global', () => {
    const rules = [
      global,
      rule({ scope: 'CLUB', clubId: 'c1', clubPercent: 4 }),
    ];
    expect(
      resolveRates(rules, { merchantId: 'm', clubId: 'c1' }),
    ).toMatchObject({
      platformPercent: 6,
      clubPercent: 4,
    });
  });

  it('club own sales pay X and give no pickup share', () => {
    expect(
      resolveRates([global], { merchantId: null, clubId: 'c1' }),
    ).toMatchObject({
      platformPercent: 6,
      clubPercent: 0,
      rules: { club: null },
    });
  });

  it('splits a sale: seller, club and Fluxion add up to the subtotal', () => {
    const result = split(10_000, 6, 2);
    expect(result).toEqual({
      subtotal: 10_000,
      platformAmount: 600,
      clubAmount: 200,
      fluxionAmount: 400,
      sellerAmount: 9_400,
    });
    const odd = split(333.33, 5.5, 1.25);
    expect(odd.sellerAmount + odd.clubAmount + odd.fluxionAmount).toBeCloseTo(
      333.33,
      2,
    );
  });

  it('rejects a merchant X lower than any club Y', () => {
    const rules = [
      global,
      rule({ scope: 'CLUB', clubId: 'Racing', clubPercent: 3 }),
      rule({
        scope: 'MERCHANT',
        merchantId: 'Deportes Sur',
        platformPercent: 2.5,
      }),
    ];
    expect(findConflict(rules, limits, names)).toMatch(
      /Deportes Sur paga 2.5%/,
    );
  });

  it('rejects a global Y above the global X', () => {
    expect(
      findConflict(
        [rule({ scope: 'GLOBAL', platformPercent: 2, clubPercent: 3 })],
        limits,
        names,
      ),
    ).toMatch(/supera la comisión de Fluxion/);
  });

  it('rejects values outside the configured ranges', () => {
    expect(
      findConflict(
        [rule({ scope: 'GLOBAL', platformPercent: 40, clubPercent: 2 })],
        limits,
        names,
      ),
    ).toMatch(/fuera del rango permitido/);
    expect(
      findConflict(
        [rule({ scope: 'GLOBAL', platformPercent: 20, clubPercent: 16 })],
        limits,
        names,
      ),
    ).toMatch(/parte del club/);
  });

  it('accepts a consistent configuration', () => {
    const rules = [
      global,
      rule({ scope: 'CLUB', clubId: 'c1', platformPercent: 4, clubPercent: 1 }),
      rule({ scope: 'MERCHANT', merchantId: 'm1', platformPercent: 3 }),
    ];
    expect(findConflict(rules, limits, names)).toBeNull();
  });
});

describe('utilidades de la tienda', () => {
  it('validates the CUIT check digit', () => {
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('20123456780')).toBe(false);
    expect(isValidCuit('123')).toBe(false);
  });

  it('computes the start of the day in the club time zone', () => {
    // 02:00 UTC del 13/10 = 23:00 del 12/10 en Buenos Aires.
    const start = startOfToday(
      'America/Argentina/Buenos_Aires',
      new Date('2026-10-13T02:00:00Z'),
    );
    expect(start.toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });
});

describe('fotos de productos', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { publicImage, decodeImage } = require('./store-public.service');

  it('serves compressed images by URL and keeps https as is', () => {
    const at = new Date(1000);
    expect(publicImage('p', 'x1', 'data:image/jpeg;base64,AAAA', at)).toBe(
      '/api/public/store/images/p/x1?v=1000',
    );
    expect(publicImage('c', 'x1', 'https://cdn.com/a.jpg', at)).toBe('https://cdn.com/a.jpg');
    expect(publicImage('p', 'x1', null, at)).toBeNull();
  });

  it('decodes only image data URLs', () => {
    expect(decodeImage('data:image/png;base64,aGk=')).toEqual({
      contentType: 'image/png',
      body: Buffer.from('hi'),
    });
    expect(decodeImage('data:text/html;base64,aGk=')).toBeNull();
  });
});
