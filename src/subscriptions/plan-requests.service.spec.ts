import { BadRequestException, ConflictException } from '@nestjs/common';

import { PlanRequestsService } from './plan-requests.service';

const actor = { uid: 'admin-1', email: 'admin@example.com' };

function setup(sub: { status: string } | null = { status: 'ACTIVE' }) {
  const requests: Record<string, any>[] = [];
  const prisma = {
    clubSubscription: {
      findUnique: jest.fn(async () => (sub ? { id: 'sub-1', ...sub } : null)),
      update: jest.fn(async ({ data }: any) => data),
    },
    subscriptionInvoice: {
      findFirst: jest.fn(async () => ({ amount: 50000, status: 'PENDING' })),
      count: jest.fn(async () => 0),
    },
    planRequest: {
      count: jest.fn(async ({ where }: any) =>
        requests.filter((r) => r.kind === where.kind && r.status === 'PENDING' && (!where.invoiceId || r.invoiceId === where.invoiceId)).length,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `r${requests.length + 1}`, status: 'PENDING', createdAt: new Date(), resolvedAt: null, response: null, ...data };
        requests.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => requests.find((r) => r.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const row = requests.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
  const subscriptions = { markInvoice: jest.fn(), reactivate: jest.fn(), forClub: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new PlanRequestsService(prisma as never, subscriptions as never, audit as never);
  return { service, prisma, subscriptions, audit, requests };
}

const who = { uid: 'u1', name: 'admin@club.example.com' };

describe('PlanRequestsService', () => {
  it('pide más usuarios y al aprobar suma los bloques', async () => {
    const { service, prisma, audit } = setup();
    const r = await service.request('club-1', 'co-1', who, { kind: 'EXTRA_USERS', extraBlocks: 2 });
    expect(r.status).toBe('PENDING');
    const done = await service.resolve(actor, r.id, { approve: true });
    expect(done.status).toBe('APPROVED');
    expect(prisma.clubSubscription.update).toHaveBeenCalledWith({
      where: { clubId: 'club-1' },
      data: { extraBlocks: { increment: 2 } },
    });
    expect(audit.record).toHaveBeenCalled();
  });

  it('no deja repetir un pedido que espera respuesta', async () => {
    const { service } = setup();
    await service.request('club-1', 'co-1', who, { kind: 'INTEGRATIONS' });
    await expect(service.request('club-1', 'co-1', who, { kind: 'INTEGRATIONS' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('un club piloto no pide packs: pide el alta', async () => {
    const { service } = setup(null);
    await expect(service.request('club-1', 'co-1', who, { kind: 'BUFFET' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.request('club-1', 'co-1', who, { kind: 'ACTIVATION' })).resolves.toMatchObject({ kind: 'ACTIVATION' });
  });

  it('aviso de pago aprobado: marca la mensualidad y reactiva si estaba suspendido', async () => {
    const { service, subscriptions } = setup({ status: 'SUSPENDED' });
    const r = await service.request('club-1', 'co-1', who, { kind: 'PAYMENT', invoiceId: 'inv-1', reference: 'op 123' });
    expect(r.amount).toBe(50000);
    const done = await service.resolve(actor, r.id, { approve: true });
    expect(subscriptions.markInvoice).toHaveBeenCalledWith(actor, 'inv-1', expect.objectContaining({ status: 'PAID', paymentRef: 'op 123' }));
    expect(subscriptions.reactivate).toHaveBeenCalled();
    expect(done.applied).toContain('reactivado');
  });

  it('rechazar no cambia el plan', async () => {
    const { service, prisma } = setup();
    const r = await service.request('club-1', 'co-1', who, { kind: 'BUFFET' });
    const done = await service.resolve(actor, r.id, { approve: false, response: 'Hablemos primero' });
    expect(done.status).toBe('REJECTED');
    expect(prisma.clubSubscription.update).not.toHaveBeenCalled();
  });
});
