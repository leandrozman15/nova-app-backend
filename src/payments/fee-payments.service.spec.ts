import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { FeePaymentsService } from './fee-payments.service';

const fee = {
  id: 'f1',
  companyId: 'c1',
  clubId: 'club1',
  playerId: 'p1',
  month: 3,
  year: 2026,
  amount: 15000,
  status: 'pending',
  mpPaymentId: null,
  club: { name: 'Club Test' },
};

describe('FeePaymentsService', () => {
  let prisma: any;
  let mp: any;
  let accounts: any;
  let service: FeePaymentsService;

  beforeEach(() => {
    process.env.PUBLIC_API_URL = 'https://api.test';
    process.env.PUBLIC_APP_URL = 'https://app.test';
    prisma = {
      playerPayment: {
        findFirst: jest.fn().mockResolvedValue(fee),
        findUnique: jest.fn().mockResolvedValue(fee),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      player: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
      clubMembership: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue({ email: 'a@b.com' }) },
      financialTransaction: { createMany: jest.fn().mockResolvedValue({}) },
    };
    mp = {
      createPreference: jest
        .fn()
        .mockResolvedValue({ id: 'pref1', init_point: 'https://mp/checkout' }),
      getPayment: jest.fn(),
    };
    accounts = {
      isConnected: jest.fn().mockResolvedValue(true),
      accessTokenFor: jest.fn().mockResolvedValue('tok'),
    };
    service = new FeePaymentsService(prisma, mp, accounts);
  });

  describe('createCheckout', () => {
    it('creates a preference with the fee reference and returns the checkout url', async () => {
      const result = await service.createCheckout('c1', 'uid1', 'f1');
      expect(result.checkoutUrl).toBe('https://mp/checkout');
      const input = mp.createPreference.mock.calls[0][1];
      expect(input.externalReference).toBe('fee:f1');
      expect(input.amount).toBe(15000);
      expect(input.notificationUrl).toContain('webhook?fee=f1');
      expect(input.backUrl).toBe(
        'https://app.test/dashboard/member/payments?cuota=f1',
      );
      expect(prisma.playerPayment.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { mpPreferenceId: 'pref1' },
      });
    });

    it('returns the player to the player portal', async () => {
      await service.createCheckout('c1', 'uid1', 'f1', 'player');
      expect(mp.createPreference.mock.calls[0][1].backUrl).toBe(
        'https://app.test/dashboard/player/payments?cuota=f1',
      );
    });

    it('rejects a fee that belongs to someone else', async () => {
      prisma.player.findFirst.mockResolvedValue(null);
      await expect(service.createCheckout('c1', 'uid2', 'f1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mp.createPreference).not.toHaveBeenCalled();
    });

    it('accepts the owner through an active club membership', async () => {
      prisma.player.findFirst.mockResolvedValue(null);
      prisma.clubMembership.findFirst.mockResolvedValue({ id: 'm1' });
      await expect(
        service.createCheckout('c1', 'uid1', 'f1'),
      ).resolves.toBeDefined();
    });

    it('rejects an already paid fee', async () => {
      prisma.playerPayment.findFirst.mockResolvedValue({
        ...fee,
        status: 'paid',
      });
      await expect(service.createCheckout('c1', 'uid1', 'f1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when the club has no Mercado Pago account', async () => {
      accounts.isConnected.mockResolvedValue(false);
      await expect(service.createCheckout('c1', 'uid1', 'f1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('applyPayment', () => {
    const approved = {
      id: 999,
      status: 'approved',
      external_reference: 'fee:f1',
      transaction_amount: 15000,
      currency_id: 'ARS',
      date_approved: '2026-10-19T12:00:00.000Z',
      fee_details: [{ type: 'mercadopago_fee', amount: 900 }],
    };

    it('marks the fee as paid and records income plus commission', async () => {
      mp.getPayment.mockResolvedValue(approved);
      await service.applyPayment('f1', '999');
      const update = prisma.playerPayment.updateMany.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'f1', status: { not: 'paid' } });
      expect(update.data).toMatchObject({
        status: 'paid',
        paymentMethod: 'mercadopago',
        mpPaymentId: '999',
      });
      const rows = prisma.financialTransaction.createMany.mock.calls[0][0].data;
      expect(rows.map((r: any) => r.reference)).toEqual([
        'mp:999',
        'mp-fee:999',
      ]);
      expect(rows[0]).toMatchObject({
        type: 'income',
        category: 'Cuotas sociales',
      });
    });

    it('refuses a payment that belongs to another reference', async () => {
      mp.getPayment.mockResolvedValue({
        ...approved,
        external_reference: 'fee:other',
      });
      await expect(service.applyPayment('f1', '999')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.playerPayment.updateMany).not.toHaveBeenCalled();
    });

    it('does not mark as paid when the amount is lower than the fee', async () => {
      mp.getPayment.mockResolvedValue({ ...approved, transaction_amount: 100 });
      await service.applyPayment('f1', '999');
      expect(prisma.playerPayment.updateMany).not.toHaveBeenCalled();
      expect(
        prisma.playerPayment.update.mock.calls[0][0].data.mpPaymentStatus,
      ).toBe('amount_mismatch');
    });

    it('only records the status for non-approved payments', async () => {
      mp.getPayment.mockResolvedValue({ ...approved, status: 'rejected' });
      await service.applyPayment('f1', '999');
      expect(prisma.playerPayment.updateMany).not.toHaveBeenCalled();
      expect(prisma.financialTransaction.createMany).not.toHaveBeenCalled();
    });
  });

  it('sync validates the payment id format', async () => {
    await expect(
      service.syncForOwner('c1', 'uid1', 'f1', 'abc'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('FeePaymentsService.listChildren (vínculo padre/tutor)', () => {
  const row = (id: string, guardianEmail: string) => ({
    id,
    companyId: 'c1',
    clubId: 'club1',
    firstName: 'Ana',
    lastName: 'Gómez',
    photoUrl: null,
    birthDate: new Date('2015-05-05'),
    extra: { guardianEmail, teamId: 't1', teamName: 'Sub 11' },
    club: { name: 'Club Test' },
  });
  const build = (rows: any[]) => {
    const prisma: any = {
      player: { findMany: jest.fn().mockResolvedValue(rows) },
      playerPayment: { groupBy: jest.fn().mockResolvedValue([{ playerId: 'p1', _count: { _all: 2 } }]) },
    };
    return { prisma, service: new FeePaymentsService(prisma, {} as any, {} as any) };
  };

  it('devuelve los hijos cuando el email del tutor coincide (sin importar mayúsculas)', async () => {
    const { service } = build([row('p1', 'Padre@Mail.com'), row('p2', 'otro@mail.com')]);
    const kids = await service.listChildren({ email: 'padre@mail.com', emailVerified: true });
    expect(kids.map((k) => k.playerId)).toEqual(['p1']);
    expect(kids[0]).toMatchObject({ clubId: 'club1', teamName: 'Sub 11', pendingFees: 2 });
  });

  it('no devuelve nada si el email del padre no está verificado', async () => {
    const { service, prisma } = build([row('p1', 'padre@mail.com')]);
    expect(await service.listChildren({ email: 'padre@mail.com', emailVerified: false })).toEqual([]);
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });
});
