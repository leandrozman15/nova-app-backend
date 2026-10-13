import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { dueDateFor, SubscriptionsService } from './subscriptions.service';
import { clubIdFromRequest, SuspendedClubGuard } from './suspended-club.guard';

const plan = {
  id: 'p1',
  name: 'Club',
  monthlyPrice: new Prisma.Decimal(50000),
};
const subscriptionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  clubId: 'club-a',
  planId: 'p1',
  customPrice: null,
  status: 'ACTIVE',
  billingDay: 10,
  startedAt: new Date('2026-01-01T00:00:00Z'),
  trialEndsAt: null,
  suspendedAt: null,
  suspendedReason: null,
  cancelledAt: null,
  notes: null,
  plan,
  ...overrides,
});

describe('SubscriptionsService', () => {
  let prisma: any;
  let audit: any;
  let service: SubscriptionsService;
  const actor = { uid: 'boss', email: 'boss@fluxion.app' };

  beforeEach(() => {
    prisma = {
      clubSubscription: {
        findUnique: jest.fn().mockResolvedValue(subscriptionRow()),
        findMany: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) => subscriptionRow(data)),
      },
      subscriptionInvoice: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      financialTransaction: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    audit = { record: jest.fn() };
    service = new SubscriptionsService(prisma, audit);
  });

  it('suspends with a reason and records it in the audit log', async () => {
    const result = await service.suspend(
      actor,
      'club-a',
      'Dos meses sin pagar',
    );
    expect(prisma.clubSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clubId: 'club-a' },
        data: expect.objectContaining({
          status: 'SUSPENDED',
          suspendedReason: 'Dos meses sin pagar',
        }),
      }),
    );
    expect(result.status).toBe('SUSPENDED');
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      'subscription.suspended',
      { type: 'ClubSubscription', id: 's1' },
      expect.objectContaining({ reason: 'Dos meses sin pagar' }),
    );
  });

  it('only reactivates suspended or cancelled subscriptions', async () => {
    await expect(
      service.reactivate(actor, 'club-a', 'Pagó'),
    ).rejects.toBeInstanceOf(ConflictException);
    prisma.clubSubscription.findUnique.mockResolvedValue(
      subscriptionRow({ status: 'SUSPENDED', suspendedReason: 'Mora' }),
    );
    await service.reactivate(actor, 'club-a', 'Pagó');
    expect(prisma.clubSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          suspendedReason: null,
        }),
      }),
    );
  });

  it('generates one invoice per active subscription and month, with the agreed price', async () => {
    prisma.clubSubscription.findMany.mockResolvedValue([
      { ...subscriptionRow(), companyId: 'co' },
      {
        ...subscriptionRow({
          id: 's2',
          clubId: 'club-b',
          customPrice: new Prisma.Decimal(30000),
          billingDay: 5,
        }),
        companyId: 'co',
      },
    ]);
    prisma.subscriptionInvoice.createMany.mockResolvedValue({ count: 1 });

    const result = await service.generateInvoices(actor, '2026-11');

    const { data, skipDuplicates } =
      prisma.subscriptionInvoice.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toEqual([
      expect.objectContaining({
        subscriptionId: 's1',
        amount: 50000,
        period: '2026-11',
        dueDate: dueDateFor('2026-11', 10),
      }),
      expect.objectContaining({
        subscriptionId: 's2',
        amount: 30000,
        dueDate: dueDateFor('2026-11', 5),
      }),
    ]);
    // La segunda ya existía: no se duplica.
    expect(result).toEqual({
      period: '2026-11',
      created: 1,
      alreadyExisted: 1,
    });
    expect(prisma.clubSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', startedAt: { lte: expect.any(Date) } },
      }),
    );
  });

  it('records a paid invoice in the club treasury and removes it if undone', async () => {
    const invoice = {
      id: 'i1',
      status: 'PENDING',
      companyId: 'co',
      clubId: 'club-a',
      period: '2026-11',
      amount: new Prisma.Decimal(50000),
      currency: 'ARS',
      paidAt: null,
      paymentMethod: null,
      paymentRef: null,
      notes: null,
      subscription: { plan: { name: 'Club' } },
    };
    prisma.subscriptionInvoice.findUnique.mockResolvedValue(invoice);
    prisma.subscriptionInvoice.update.mockImplementation(({ data }) => ({
      ...invoice,
      ...data,
    }));

    await service.markInvoice(actor, 'i1', {
      status: 'PAID',
      paymentMethod: 'Transferencia',
    });
    expect(prisma.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'expense',
        category: 'Fluxion · Suscripción',
        reference: 'fx-sub:i1',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      'subscription.invoice.paid',
      expect.anything(),
      expect.anything(),
    );

    prisma.subscriptionInvoice.findUnique.mockResolvedValue({
      ...invoice,
      status: 'PAID',
    });
    await service.markInvoice(actor, 'i1', { status: 'PENDING' });
    expect(prisma.financialTransaction.deleteMany).toHaveBeenCalledWith({
      where: { reference: 'fx-sub:i1' },
    });
  });
});

describe('SuspendedClubGuard', () => {
  const run = async (
    status: string | null,
    request: Record<string, unknown>,
    platformRole: string | null = null,
  ) => {
    const prisma: any = {
      clubSubscription: {
        findUnique: jest.fn().mockResolvedValue(status ? { status } : null),
      },
    };
    const access: any = { roleOf: jest.fn().mockResolvedValue(platformRole) };
    const guard = new SuspendedClubGuard(prisma, access);
    return guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as any);
  };

  it('finds the club in /clubs/:clubId/... and /clubs/:id routes', () => {
    expect(clubIdFromRequest({ params: { clubId: 'a' } })).toBe('a');
    expect(
      clubIdFromRequest({ params: { id: 'b' }, route: { path: '/clubs/:id' } }),
    ).toBe('b');
    expect(
      clubIdFromRequest({
        params: { id: 'x' },
        route: { path: '/players/:id' },
      }),
    ).toBeUndefined();
  });

  it('leaves a suspended club read-only', async () => {
    const write = { method: 'POST', params: { clubId: 'club-a' } };
    await expect(run('SUSPENDED', write)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(run('SUSPENDED', { ...write, method: 'GET' })).resolves.toBe(
      true,
    );
    await expect(run('ACTIVE', write)).resolves.toBe(true);
    await expect(run(null, write)).resolves.toBe(true);
  });

  it('lets Fluxion admins work on a suspended club', async () => {
    await expect(
      run(
        'CANCELLED',
        { method: 'PATCH', params: { clubId: 'club-a' } },
        'SUPERADMIN',
      ),
    ).resolves.toBe(true);
  });
});
