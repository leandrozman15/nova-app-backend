jest.mock('@prisma/client', () => ({
  PaymentStatus: { paid: 'paid', pending: 'pending', overdue: 'overdue' },
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../email/email-notifications.service', () => ({
  EmailNotificationsService: class {},
}));
jest.mock('../invoicing/invoicing.service', () => ({
  InvoicingService: class {},
}));

import { PlayerPaymentsService } from './player-payments.service';

function setup(current: Record<string, unknown>) {
  const tx = {
    findFirst: jest.fn().mockResolvedValue(null),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const fee = {
    id: 'f1',
    companyId: 'c1',
    clubId: 'club1',
    playerId: 'p1',
    month: 11,
    year: 2026,
    amount: '15000',
    status: 'pending',
    paymentMethod: null,
    paymentDate: null,
    mpPaymentId: null,
    player: { firstName: 'Ana', lastName: 'Demo' },
    ...current,
  };
  const prisma = {
    financialTransaction: tx,
    player: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
    playerPayment: {
      findFirst: jest.fn().mockResolvedValue(fee),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...fee, ...data })),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({
            ...fee,
            ...Object.fromEntries(
              Object.entries(data).filter(([, v]) => v !== undefined),
            ),
          }),
        ),
    },
  };
  return { service: new PlayerPaymentsService(prisma as never), tx };
}

describe('cuotas cobradas a mano en Tesorería', () => {
  it('al marcar pagada registra el ingreso en caja', async () => {
    const { service, tx } = setup({});
    await service.update('c1', 'f1', {
      status: 'paid',
      paymentMethod: 'Transferencia',
    } as never);
    expect(tx.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          reference: 'fee:f1',
          amount: 15000,
          type: 'income',
          clubId: 'club1',
        }),
      ],
    });
  });

  it('si vuelve a pendiente, saca el ingreso', async () => {
    const { service, tx } = setup({ status: 'paid', paymentDate: new Date() });
    await service.update('c1', 'f1', { status: 'pending' } as never);
    expect(tx.deleteMany).toHaveBeenCalledWith({
      where: { companyId: 'c1', reference: 'fee:f1' },
    });
    expect(tx.createMany).not.toHaveBeenCalled();
  });

  it('si ya estaba en caja, actualiza el monto en vez de duplicar', async () => {
    const { service, tx } = setup({ status: 'paid', paymentDate: new Date() });
    tx.findFirst.mockResolvedValue({ id: 't1' });
    await service.update('c1', 'f1', { amount: 18000 } as never);
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ amount: 18000 }),
      }),
    );
    expect(tx.createMany).not.toHaveBeenCalled();
  });

  it('un alta ya cobrada entra a caja', async () => {
    const { service, tx } = setup({});
    await service.create('c1', {
      clubId: 'club1',
      playerId: 'p1',
      month: 11,
      year: 2026,
      amount: 15000,
      status: 'paid',
    } as never);
    expect(tx.createMany).toHaveBeenCalledTimes(1);
  });
});
