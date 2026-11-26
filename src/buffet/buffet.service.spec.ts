import { BuffetService } from './buffet.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const tx: any = {
    buffetProduct: { findMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    buffetSale: { create: jest.fn(), update: jest.fn() },
    buffetSalePayment: { createMany: jest.fn() },
    booking: { update: jest.fn() },
    buffetStockMovement: { create: jest.fn() },
    financialTransaction: { create: jest.fn().mockResolvedValue({ id: 'ft1' }) },
    buffetCashSession: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data })) },
  };
  const prisma: any = {
    ...tx,
    buffetCashSession: { ...tx.buffetCashSession, findFirst: jest.fn() },
    buffet: { findUnique: jest.fn(), create: jest.fn() },
    buffetSale: { ...tx.buffetSale, findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    buffetSalePayment: { ...tx.buffetSalePayment, findMany: jest.fn().mockResolvedValue([]) },
    booking: { ...tx.booking, findFirst: jest.fn(), findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
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

  it('reenviar una venta con el mismo clientRef devuelve la original sin volver a descontar', async () => {
    const { prisma, tx } = makePrisma();
    prisma.buffetSale.findFirst.mockResolvedValue({ id: 'sale1', items: [] });
    const service = new BuffetService(prisma);
    const r = await service.createSale('co', 'c1', actor, {
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'cash',
      clientRef: 'dev-123',
    });
    expect(r.id).toBe('sale1');
    expect(tx.buffetSale.create).not.toHaveBeenCalled();
    expect(tx.buffetProduct.update).not.toHaveBeenCalled();
  });

  it('dos reenvíos a la vez: el que choca con el índice único devuelve la venta ganadora', async () => {
    const { prisma, tx } = makePrisma();
    prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
    prisma.buffetSale.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'sale1', items: [] });
    tx.buffetProduct.findMany.mockResolvedValue([{ id: 'p1', name: 'Gaseosa', price: 1000, cost: 600, stock: 10, trackStock: true }]);
    tx.buffetSale.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const service = new BuffetService(prisma);
    const r = await service.createSale('co', 'c1', actor, {
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'cash',
      clientRef: 'dev-123',
    });
    expect(r.id).toBe('sale1');
  });

  it('el cierre de caja de un buffet propio crea el ingreso en tesorería', async () => {
    const { prisma, tx } = makePrisma();
    prisma.buffet.findUnique.mockResolvedValue({ mode: 'own', percent: null, concessionaire: null, active: true });
    prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1', status: 'open', openingAmount: 1000 });
    prisma.buffetSale.findMany.mockResolvedValue([
      { status: 'completed', total: 4000, items: [], payments: [] },
      { status: 'completed', total: 6000, items: [], payments: [] },
      { status: 'voided', total: 999, items: [], payments: [] },
    ]);
    prisma.buffetSalePayment.findMany.mockResolvedValue([
      { method: 'cash', amount: 4000 },
      { method: 'mercadopago', amount: 6000 },
    ]);
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
    prisma.buffetSale.findMany.mockResolvedValue([{ status: 'completed', total: 20000, items: [], payments: [] }]);
    prisma.buffetSalePayment.findMany.mockResolvedValue([{ method: 'cash', amount: 20000 }]);
    const service = new BuffetService(prisma);
    await service.closeSession('co', 'c1', 's1', actor, { countedCash: 20000, reportToTreasury: true });
    expect(tx.financialTransaction.create.mock.calls[0][0].data.amount).toBe(2000);

    tx.financialTransaction.create.mockClear();
    await service.closeSession('co', 'c1', 's1', actor, { countedCash: 20000, reportToTreasury: false });
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
  });

  describe('pago dividido', () => {
    const product = { id: 'p1', name: 'Gaseosa', price: 1000, cost: 600, stock: 10, trackStock: true };

    it('guarda un cobro por medio y marca la venta como mixta', async () => {
      const { prisma, tx } = makePrisma();
      prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
      tx.buffetProduct.findMany.mockResolvedValue([product]);
      tx.buffetSale.create.mockResolvedValue({ id: 'sale1', items: [], payments: [] });
      const service = new BuffetService(prisma);
      await service.createSale('co', 'c1', actor, {
        items: [{ productId: 'p1', quantity: 3 }],
        payments: [{ method: 'cash', amount: 2000 }, { method: 'transfer', amount: 1000 }],
      });
      const data = tx.buffetSale.create.mock.calls[0][0].data;
      expect(data.paymentMethod).toBe('mixed');
      expect(data.accountStatus).toBeNull();
      expect(data.payments.create).toEqual([
        { sessionId: 's1', method: 'cash', amount: 2000 },
        { sessionId: 's1', method: 'transfer', amount: 1000 },
      ]);
    });

    it('rechaza pagos que no suman el total de la venta', async () => {
      const { prisma, tx } = makePrisma();
      prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
      tx.buffetProduct.findMany.mockResolvedValue([product]);
      const service = new BuffetService(prisma);
      await expect(
        service.createSale('co', 'c1', actor, {
          items: [{ productId: 'p1', quantity: 3 }],
          payments: [{ method: 'cash', amount: 2000 }, { method: 'transfer', amount: 500 }],
        }),
      ).rejects.toThrow('Los pagos suman 2500');
      expect(tx.buffetSale.create).not.toHaveBeenCalled();
    });

    it('un solo medio por el total sigue funcionando como antes y crea su cobro', async () => {
      const { prisma, tx } = makePrisma();
      prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
      tx.buffetProduct.findMany.mockResolvedValue([product]);
      tx.buffetSale.create.mockResolvedValue({ id: 'sale1', items: [], payments: [] });
      const service = new BuffetService(prisma);
      await service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'card' });
      const data = tx.buffetSale.create.mock.calls[0][0].data;
      expect(data.paymentMethod).toBe('card');
      expect(data.payments.create).toEqual([{ sessionId: 's1', method: 'card', amount: 2000 }]);
    });

    it('guarda quién retira la compra, sin espacios de más', async () => {
      const { prisma, tx } = makePrisma();
      prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
      tx.buffetProduct.findMany.mockResolvedValue([product]);
      tx.buffetSale.create.mockResolvedValue({ id: 'sale1', items: [], payments: [] });
      const service = new BuffetService(prisma);
      await service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash', pickedUpBy: '  Pedro  ' });
      expect(tx.buffetSale.create.mock.calls[0][0].data.pickedUpBy).toBe('Pedro');
      await service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' });
      expect(tx.buffetSale.create.mock.calls[1][0].data.pickedUpBy).toBeNull();
    });

    it('exige elegir una sola forma de cobro', async () => {
      const { prisma } = makePrisma();
      const service = new BuffetService(prisma);
      await expect(service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 1 }] })).rejects.toThrow('Indicá cómo se cobra');
      await expect(
        service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash', bookingId: 'b1' }),
      ).rejects.toThrow('una sola forma de cobro');
    });
  });

  describe('cuenta de alquiler', () => {
    const product = { id: 'p1', name: 'Gaseosa', price: 1000, cost: 600, stock: 10, trackStock: true };
    const bookingRow = (over: Record<string, unknown> = {}) => ({
      id: 'b1',
      date: '2026-11-26',
      startMinute: 1140,
      durationMinutes: 60,
      price: 12000,
      paidAmount: 3000,
      contactName: 'Juan',
      facility: { name: 'Cancha 2' },
      user: null,
      buffetSales: [
        { id: 'sa1', total: 2000, createdAt: new Date(), createdByName: 'buffet', items: [{ name: 'Gaseosa', quantity: 2, unitPrice: 1000 }] },
        { id: 'sa2', total: 1000, createdAt: new Date(), createdByName: 'buffet', items: [{ name: 'Agua', quantity: 1, unitPrice: 1000 }] },
      ],
      ...over,
    });

    it('cargar un consumo a la cuenta no mueve plata: queda pendiente y sin cobros', async () => {
      const { prisma, tx } = makePrisma();
      prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
      prisma.booking.findFirst.mockResolvedValue({ id: 'b1' });
      tx.buffetProduct.findMany.mockResolvedValue([product]);
      tx.buffetSale.create.mockResolvedValue({ id: 'sale1', items: [], payments: [] });
      const service = new BuffetService(prisma);
      await service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 2 }], bookingId: 'b1' });
      const data = tx.buffetSale.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ paymentMethod: 'account', bookingId: 'b1', accountStatus: 'pending', total: 2000 });
      expect(data.payments).toBeUndefined();
      // Igual descuenta stock: el consumo ya ocurrió.
      expect(tx.buffetProduct.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { decrement: 2 } } });
    });

    it('no deja cargar a un alquiler inexistente o cancelado', async () => {
      const { prisma } = makePrisma();
      prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's1' });
      prisma.booking.findFirst.mockResolvedValue(null);
      const service = new BuffetService(prisma);
      await expect(
        service.createSale('co', 'c1', actor, { items: [{ productId: 'p1', quantity: 1 }], bookingId: 'x' }),
      ).rejects.toThrow('no está confirmado');
    });

    it('la cuenta muestra consumos + lo que falta de la cancha', async () => {
      const { prisma } = makePrisma();
      prisma.booking.findFirst.mockResolvedValue(bookingRow());
      const service = new BuffetService(prisma);
      const acc = await service.getAccount('co', 'c1', 'b1');
      expect(acc).toMatchObject({ name: 'Juan', courtPrice: 12000, courtPaid: 3000, courtBalance: 9000, consumptionTotal: 3000, due: 12000 });
      expect(acc.consumptions).toHaveLength(2);
    });

    it('al cerrar reparte lo pagado: primero los consumos en la caja y el resto al turno y a Tesorería', async () => {
      const { prisma, tx } = makePrisma();
      prisma.booking.findFirst.mockResolvedValue(bookingRow());
      prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's9' });
      prisma.booking.findUniqueOrThrow.mockResolvedValue({ attendance: null, currency: 'ARS', facilityId: 'f1', date: '2026-11-26', startMinute: 1140, contactName: 'Juan' });
      const service = new BuffetService(prisma);
      // Debe 3000 de consumos + 9000 de cancha = 12000; paga 5000 en efectivo y 7000 por transferencia.
      const res = await service.settleAccount('co', 'c1', 'b1', { payments: [{ method: 'cash', amount: 5000 }, { method: 'transfer', amount: 7000 }] });
      expect(res).toMatchObject({ ok: true, collected: 12000, consumptions: 3000, court: 9000 });

      const sessions = tx.buffetSalePayment.createMany.mock.calls.map((c: any) => c[0].data);
      expect(sessions[0]).toEqual([{ saleId: 'sa1', sessionId: 's9', method: 'cash', amount: 2000 }]);
      expect(sessions[1]).toEqual([{ saleId: 'sa2', sessionId: 's9', method: 'cash', amount: 1000 }]);
      expect(tx.buffetSale.update).toHaveBeenCalledTimes(2);
      expect(tx.buffetSale.update.mock.calls[0][0].data).toMatchObject({ accountStatus: 'settled' });

      // Al turno le quedan 2000 en efectivo y 7000 por transferencia.
      expect(tx.booking.update.mock.calls[0][0].data).toMatchObject({ paidAmount: { increment: 9000 }, paymentMethod: 'transfer', attendance: 'SHOWED' });
      const income = prisma.financialTransaction.create.mock.calls.map((c: any) => c[0].data);
      expect(income.map((d: any) => d.amount)).toEqual([2000, 7000]);
      expect(income.every((d: any) => d.category === 'Alquiler de canchas' && d.type === 'income')).toBe(true);
    });

    it('rechaza cerrar si los pagos no suman la cuenta o si no hay caja abierta', async () => {
      const { prisma, tx } = makePrisma();
      prisma.booking.findFirst.mockResolvedValue(bookingRow());
      prisma.buffetCashSession.findFirst.mockResolvedValue({ id: 's9' });
      const service = new BuffetService(prisma);
      await expect(service.settleAccount('co', 'c1', 'b1', { payments: [{ method: 'cash', amount: 11000 }] })).rejects.toThrow('Los pagos suman 11000');

      prisma.buffetCashSession.findFirst.mockResolvedValue(null);
      await expect(service.settleAccount('co', 'c1', 'b1', { payments: [{ method: 'cash', amount: 12000 }] })).rejects.toThrow('Abrí la caja del buffet');
      expect(tx.buffetSale.update).not.toHaveBeenCalled();
    });

    it('una cuenta sin consumos se puede cerrar sin caja abierta: solo cobra la cancha', async () => {
      const { prisma, tx } = makePrisma();
      prisma.booking.findFirst.mockResolvedValue(bookingRow({ buffetSales: [] }));
      prisma.buffetCashSession.findFirst.mockResolvedValue(null);
      prisma.booking.findUniqueOrThrow.mockResolvedValue({ attendance: 'SHOWED', currency: 'ARS', facilityId: 'f1', date: '2026-11-26', startMinute: 1140, contactName: 'Juan' });
      const service = new BuffetService(prisma);
      await service.settleAccount('co', 'c1', 'b1', { payments: [{ method: 'cash', amount: 9000 }] });
      expect(tx.buffetSalePayment.createMany).not.toHaveBeenCalled();
      expect(tx.booking.update.mock.calls[0][0].data.paidAmount).toEqual({ increment: 9000 });
    });

    it('no se puede anular un consumo ya cobrado, pero sí uno pendiente aunque su caja esté cerrada', async () => {
      const { prisma, tx } = makePrisma();
      const service = new BuffetService(prisma);
      prisma.buffetSale.findFirst.mockResolvedValueOnce({ id: 'v1', status: 'completed', accountStatus: 'settled', items: [], session: { status: 'open' } });
      await expect(service.voidSale('co', 'c1', 'v1', actor, 'error')).rejects.toThrow('ya se cobró');

      prisma.buffetSale.findFirst.mockResolvedValueOnce({ id: 'v2', status: 'completed', accountStatus: 'pending', items: [], session: { status: 'closed' } });
      await expect(service.voidSale('co', 'c1', 'v2', actor, 'error')).resolves.toEqual({ ok: true });
      expect(tx.buffetSale.update).toHaveBeenCalled();
    });
  });
});
