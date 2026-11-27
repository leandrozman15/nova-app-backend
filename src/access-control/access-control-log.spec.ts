import { ForbiddenException } from '@nestjs/common';

// Evita arrastrar la cadena docstore -> firebase-admin (ESM) solo para construir el servicio.
jest.mock('../docstore/docstore.service', () => ({ DocStoreService: class {} }));

import { AccessControlService } from './access-control.service';

const mk = (players: Record<string, any>, logs: any[] = []) => {
  const prisma: any = {
    player: {
      findUnique: jest.fn(async ({ where }: any) => players[where.id] ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        Object.entries(players)
          .filter(([id]) => where.id.in.includes(id))
          .map(([id, p]) => ({ id, firstName: p.firstName, lastName: p.lastName })),
      ),
    },
    accessLog: {
      findMany: jest.fn(async ({ where }: any) =>
        logs.filter(
          (l) =>
            l.companyId === where.companyId &&
            l.clubId === where.clubId &&
            (!where.playerId || l.playerId === where.playerId) &&
            (!where.createdAt || (l.createdAt >= where.createdAt.gte && l.createdAt < where.createdAt.lt)),
        ),
      ),
    },
  };
  return new AccessControlService(prisma, {} as any);
};

describe('fichajes para la familia', () => {
  const player = {
    companyId: 'c1',
    clubId: 'club1',
    extra: { guardianEmail: 'mama@x.com' },
    firstName: 'Ana',
    lastName: 'Ruiz',
  };
  const logs = [
    { companyId: 'c1', clubId: 'club1', playerId: 'p1', result: 'green', reasons: [], createdAt: new Date('2026-11-05T10:00:00Z') },
    { companyId: 'c1', clubId: 'club1', playerId: 'p1', result: 'green', reasons: [], createdAt: new Date('2026-10-05T10:00:00Z') },
  ];

  it('rechaza si el email no es el tutor vinculado', async () => {
    const svc = mk({ p1: player }, logs);
    await expect(
      svc.forGuardian({ email: 'otro@x.com', emailVerified: true }, 'p1', 11, 2026),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige email verificado', async () => {
    const svc = mk({ p1: player }, logs);
    await expect(
      svc.forGuardian({ email: 'mama@x.com', emailVerified: false }, 'p1', 11, 2026),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('devuelve solo los fichajes del mes pedido', async () => {
    const svc = mk({ p1: player }, logs);
    const nov = await svc.forGuardian({ email: 'mama@x.com', emailVerified: true }, 'p1', 11, 2026);
    expect(nov).toHaveLength(1);
    const oct = await svc.forGuardian({ email: 'mama@x.com', emailVerified: true }, 'p1', 10, 2026);
    expect(oct).toHaveLength(1);
    const dec = await svc.forGuardian({ email: 'mama@x.com', emailVerified: true }, 'p1', 12, 2026);
    expect(dec).toHaveLength(0);
  });
});
