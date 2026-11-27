import { BadRequestException } from '@nestjs/common';

import { autoDebitOf, looksLikeAccountNumber } from './auto-debit';
import { AutoDebitService } from './auto-debit.service';

describe('débito automático', () => {
  it('solo muestra la adhesión activa', () => {
    expect(autoDebitOf(null)).toBeNull();
    expect(autoDebitOf({ active: false, method: 'cbu' })).toBeNull();
    expect(autoDebitOf({ active: true, method: 'tarjeta', label: ' Visa 4417 ', since: '2026-11-01' })).toEqual({
      active: true, method: 'tarjeta', label: 'Visa 4417', since: '2026-11-01',
    });
  });

  it('detecta números de cuenta o tarjeta', () => {
    expect(looksLikeAccountNumber('4509 9535 6623 3704')).toBe(true);
    expect(looksLikeAccountNumber('0170099220000067797370')).toBe(true);
    expect(looksLikeAccountNumber('Visa terminada en 4417')).toBe(false);
    expect(looksLikeAccountNumber('Banco Galicia')).toBe(false);
  });
});

describe('AutoDebitService', () => {
  const player = { id: 'p1', firstName: 'Ana', lastName: 'Gómez', autoDebit: { active: true, method: 'cbu' } };
  const mk = (fees: any[]) => {
    const prisma: any = {
      player: { findMany: jest.fn(async () => [player]), findFirst: jest.fn(async () => ({ id: 'p1' })), update: jest.fn() },
      playerPayment: { findMany: jest.fn(async () => fees) },
    };
    const payments: any = { update: jest.fn() };
    return { svc: new AutoDebitService(prisma, payments), prisma, payments };
  };

  it('registra el abono como Débito automático solo de las cuotas pendientes', async () => {
    const { svc, payments } = mk([{ id: 'f1', playerId: 'p1', status: 'pending', amount: 25000, paymentDate: null }]);
    const r = await svc.collect('c', 'club', { month: 11, year: 2026, paymentDate: '2026-11-10', playerIds: ['p1'] });
    expect(r.paid).toBe(1);
    expect(payments.update).toHaveBeenCalledWith('c', 'f1', { status: 'paid', paymentMethod: 'Débito automático', paymentDate: '2026-11-10' });
  });

  it('no vuelve a cobrar una cuota ya cobrada ni a quien no está adherido', async () => {
    const { svc, payments } = mk([{ id: 'f1', playerId: 'p1', status: 'paid', amount: 1, paymentDate: new Date() }]);
    const r = await svc.collect('c', 'club', { month: 11, year: 2026, paymentDate: '2026-11-10', playerIds: ['p1', 'p9'] });
    expect(r.paid).toBe(0);
    expect(r.skipped.map((s) => s.reason)).toEqual(['La cuota ya estaba cobrada', 'No está adherido al débito automático']);
    expect(payments.update).not.toHaveBeenCalled();
  });

  it('rechaza guardar un número de cuenta', async () => {
    const { svc } = mk([]);
    await expect(svc.set('c', 'club', 'p1', 'u', { active: true, label: '0170099220000067797370' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
