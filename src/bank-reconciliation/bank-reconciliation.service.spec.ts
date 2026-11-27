import { ConflictException, BadRequestException } from '@nestjs/common';

import { BankReconciliationService } from './bank-reconciliation.service';

const build = (
  over: {
    fee?: Record<string, unknown>;
    movement?: Record<string, unknown>;
  } = {},
) => {
  const movement = {
    id: 'm1',
    companyId: 'co',
    clubId: 'c1',
    status: 'pending',
    date: new Date('2026-11-12T00:00:00Z'),
    amount: 16500,
    description: 'PEREZ JUAN',
    matchedFeeId: null,
    transactionId: null,
    ...over.movement,
  };
  const prisma = {
    club: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 'c1',
          timezone: 'America/Argentina/Buenos_Aires',
        }),
    },
    bankMovement: {
      findFirst: jest.fn().mockResolvedValue(movement),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    playerPayment: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 'f1',
          amount: 15000,
          status: 'pending',
          ...over.fee,
        }),
    },
    financialTransaction: {
      create: jest.fn().mockResolvedValue({ id: 't1' }),
      deleteMany: jest.fn(),
    },
  };
  const payments = { update: jest.fn().mockResolvedValue({}) };
  return {
    service: new BankReconciliationService(prisma as never, payments as never),
    prisma,
    payments,
  };
};

describe('BankReconciliationService', () => {
  it('confirmar una cuota la cobra con la fecha del banco y los intereses del excedente', async () => {
    const { service, payments } = build();
    await service.match('co', 'c1', 'm1', 'f1', 'u1');
    expect(payments.update).toHaveBeenCalledWith('co', 'f1', {
      status: 'paid',
      paymentMethod: 'Transferencia',
      paymentDate: '2026-11-12',
      lateFeeAmount: 1500,
    });
  });

  it('no deja confirmar un importe menor a la cuota ni una cuota ya cobrada', async () => {
    await expect(
      build({ movement: { amount: 14000 } }).service.match(
        'co',
        'c1',
        'm1',
        'f1',
        'u',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      build({ fee: { status: 'paid' } }).service.match(
        'co',
        'c1',
        'm1',
        'f1',
        'u',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('si dos personas confirman a la vez, la segunda recibe conflicto', async () => {
    const { service, prisma, payments } = build();
    prisma.bankMovement.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.match('co', 'c1', 'm1', 'f1', 'u'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(payments.update).not.toHaveBeenCalled();
  });

  it('si falla el cobro, el movimiento vuelve a pendiente', async () => {
    const { service, prisma, payments } = build();
    payments.update.mockRejectedValue(new Error('boom'));
    await expect(service.match('co', 'c1', 'm1', 'f1', 'u')).rejects.toThrow(
      'boom',
    );
    expect(prisma.bankMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending' }),
      }),
    );
  });

  it('registrar un débito lo carga como egreso', async () => {
    const { service, prisma } = build({ movement: { amount: -8000 } });
    await service.record('co', 'c1', 'm1', 'u', { category: 'Servicios' });
    expect(prisma.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'expense',
        amount: 8000,
        reference: 'bank:m1',
      }),
    });
  });

  it('deshacer una cuota conciliada la vuelve a pendiente', async () => {
    const { service, payments } = build({
      movement: { status: 'matched', matchedFeeId: 'f1' },
    });
    await service.undo('co', 'c1', 'm1');
    expect(payments.update).toHaveBeenCalledWith('co', 'f1', {
      status: 'pending',
    });
  });
});
