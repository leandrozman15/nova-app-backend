import {
  athleteLimit,
  blocksNeeded,
  priceBreakdown,
  seatsProblem,
} from './plan-rules';

const plan = {
  monthlyPrice: 50000,
  includedAthletes: 250,
  extraBlockSize: 100,
  extraBlockPrice: 10000,
  buffetPackPrice: 15000,
  integrationsPackPrice: 15000,
};

describe('plan-rules', () => {
  it('cupo: 250 incluidos más 100 por bloque', () => {
    expect(athleteLimit(plan, { extraBlocks: 0 })).toBe(250);
    expect(athleteLimit(plan, { extraBlocks: 2 })).toBe(450);
  });

  it('precio: base, bloques y packs; el pactado manda', () => {
    expect(
      priceBreakdown(plan, {
        extraBlocks: 2,
        buffetPack: true,
        integrationsPack: true,
        customPrice: null,
      }),
    ).toEqual({
      base: 50000,
      extras: 20000,
      buffet: 15000,
      integrations: 15000,
      listTotal: 100000,
      total: 100000,
    });
    expect(
      priceBreakdown(plan, {
        extraBlocks: 1,
        buffetPack: false,
        integrationsPack: false,
        customPrice: 40000,
      }).total,
    ).toBe(40000);
  });

  it('bloques que hacen falta según los atletas', () => {
    expect(blocksNeeded(plan, 250)).toBe(0);
    expect(blocksNeeded(plan, 251)).toBe(1);
    expect(blocksNeeded(plan, 451)).toBe(3);
  });

  it('avisa cuando se supera el cupo', () => {
    expect(seatsProblem(250, 240, 10)).toBeNull();
    expect(seatsProblem(250, 245, 10)).toMatch(/quedan 5 lugares/);
    expect(seatsProblem(250, 250, 1)).toMatch(/ya están todos ocupados/);
  });
});
