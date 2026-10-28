import { BuffetService } from './buffet.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const tx: any = {
    buffetProduct: { findMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    buffetSale: { create: jest.fn(), update: jest.fn() },
    buffetStockMovement: { create: jest.fn() },
    financialTransaction: { create: jest.fn().mockResolvedValue({ id: 'ft1' }) },
    buffetCashSession: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data })) },
  };
  const prisma: any = {
    ...tx,
    buffetCashSession: { ...tx.buffetCashSession, findFirst: jest.fn() },
    buffet: { findUnique: jest.fn(), create: jest.fn() },
    club: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    $transaction: jest.fn((fn: any) => fn(tx)),
    ...overrides,
  };
  return { prisma, tx };
}

const actor = { uid: 'u1', name: 'buffet@club.com' };

describe('BuffetService', () => {
  it('rechaza vender sin caja abierta', async () => {
    const { prisma } = makePrisma();
    prisma.buffetCashSession.findFirst.mockResolvedValue(null);
    const service = new BuffetService(prisma);
    await expect(
      service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' }),
    ).rejects.toThrow('Abrí la caja');
  });

  it('rechaza vender con stock insuficiente', async () => {
    const { prisma, tx } = makePrisma();
    prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
    tx.buffetProduct.findMany.mockResolvedValue([{ id: 'p1', name: 'Gaseosa', price: 1000, cost: 600, stock: 1, trackStock: true }]);
    const service = new BuffetService(prisma);
    await expect(
      service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'cash' }),
    ).rejects.toThrow('Stock insuficiente');
  });

  it('descuenta stock y calcula el total con precios del servidor', async () => {
    const { prisma, tx } = makePrisma();
    prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
    tx.buffetProduct.findMany.mockResolvedValue([{ id: 'p1', name: 'Gaseosa', price: 1000, cost: 600, stock: 10, trackStock: true }]);
    tx.buffetSale.create.mockResolvedValue({ id: 'sale1', items: [] });
    const service = new BuffetService(prisma);
    await service.createSale('co', 'c1', actor, {
      items: [{ productId: 'p1', quantity: 2 }, { productId: 'p1', quantity: 1 }],
      paymentMethod: 'cash',
    });
    expect(tx.buffetSale.create.mock.calls[0][0].data.total).toBe(3000);
    expect(tx.buffetProduct.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { decrement: 3 } } });
    expect(tx.buffetStockMovement.create.mock.calls[0][0].data).toMatchObject({ delta: -3, reason: 'sale' });
  });

  it('el cierre de caja de un buffet propio crea el ingreso en tesorería', async () => {
    const { prisma, tx } = makePrisma();
    prisma.buffet.findUnique.mockResolvedValue({ mode: 'own', percent: null, concessionaire: null, active: true });
    prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1', status: 'open', openingAmount: 1000 });
    prisma.buffetSale = { findMany: jest.fn().mockResolvedValue([
      { status: 'completed', paymentMethod: 'cash', total: 4000, items: [] },
      { status: 'completed', paymentMethod: 'mercadopago', total: 6000, items: [] },
      { status: 'voided', paymentMethod: 'cash', total: 999, items: [] },
    ]) };
    const service = new BuffetService(prisma);
    const res: any = await service.closeSession('co', 'c1', 's1', actor, { countedCash: 5000, reportToTreasury: true });
    expect(tx.financialTransaction.create.mock.calls[0][0].data).toMatchObject({ type: 'income', amount: 10000, clubId: 'c1' });
    expect(res.difference).toBe(0); // esperado = 1000 + 4000 efectivo
    expect(res.reportedToTreasury).toBe(true);
  });

  it('tercerizado con % solo informa la participación del club y sin reporte no crea ingreso', async () => {
    const { prisma, tx } = makePrisma();
    prisma.buffet.findUnique.mockResolvedValue({ mode: 'percent', percent: 10, concessionaire: 'Don Pepe', active: true });
    prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1', status: 'open', openingAmount: 0 });
    prisma.buffetSale = { findMany: jest.fn().mockResolvedValue([{ status: 'completed', paymentMethod: 'cash', total: 20000, items: [] }]) };
    const service = new BuffetService(prisma);
    await service.closeSession('co', 'c1', 's1', actor, { countedCash: 20000, reportToTreasury: true });
    expect(tx.financialTransaction.create.mock.calls[0][0].data.amount).toBe(2000);

    tx.financialTransaction.create.mockClear();
    await service.closeSession('co', 'c1', 's1', actor, { countedCash: 20000, reportToTreasury: false });
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
  });
});
