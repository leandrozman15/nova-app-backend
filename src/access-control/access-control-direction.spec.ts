// Evita arrastrar la cadena docstore -> firebase-admin (ESM) solo para construir el servicio.
jest.mock('../docstore/docstore.service', () => ({ DocStoreService: class {} }));

import { AccessControlService } from './access-control.service';
import { signAccessToken } from './access-token';

process.env.ACCESS_QR_KEY = 'test-key-direction';

const mk = (logs: any[] = []) => {
  const player = {
    id: 'p1',
    firstName: 'Fran',
    lastName: 'Gómez',
    photoUrl: null,
    active: true,
  };
  const created: any[] = [];
  const prisma: any = {
    player: { findFirst: jest.fn(async () => player) },
    club: { findUnique: jest.fn(async () => ({ timezone: 'America/Argentina/Buenos_Aires' })) },
    playerPayment: { findMany: jest.fn(async () => []) },
    accessLog: {
      findFirst: jest.fn(async ({ orderBy, where }: any) => {
        // nextDirection pide el último fichaje de cualquier fecha; confirm pide el de los últimos REPEAT_MINUTES.
        if (orderBy?.createdAt === 'desc') {
          const sorted = [...logs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return sorted[0] ?? null;
        }
        return logs.find((l) => l.createdAt >= where.createdAt.gte) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        return data;
      }),
    },
  };
  const store = { query: jest.fn(async () => []) };
  return { svc: new AccessControlService(prisma, store as any), created };
};

/** Token recién emitido: válido ahora mismo, cualquiera sea la hora real en que corra el test. */
const freshToken = () => signAccessToken('p1', undefined, Date.now());
/** Un fichaje de hace `hoursAgo` horas, siempre dentro del mismo día calendario. */
const logHoursAgo = (hoursAgo: number, direction: 'in' | 'out') => ({
  playerId: 'p1',
  direction,
  createdAt: new Date(Date.now() - hoursAgo * 3_600_000),
});

describe('entrada o salida detectada sola', () => {
  it('primera fichada: entrada', async () => {
    const { svc, created } = mk([]);
    const r = await svc.preview('c1', 'club1', freshToken());
    expect(r.direction).toBe('in');
    expect(created).toHaveLength(0); // preview no ficha
  });

  it('si ya entró hoy, la siguiente es salida', async () => {
    const { svc } = mk([logHoursAgo(1, 'in')]);
    const r = await svc.preview('c1', 'club1', freshToken());
    expect(r.direction).toBe('out');
  });

  it('si ya salió hoy, la siguiente vuelve a ser entrada', async () => {
    const { svc } = mk([logHoursAgo(2, 'in'), logHoursAgo(1, 'out')]);
    const r = await svc.preview('c1', 'club1', freshToken());
    expect(r.direction).toBe('in');
  });

  it('un fichaje de hace más de un día no cuenta: vuelve a ser entrada', async () => {
    const { svc } = mk([{ playerId: 'p1', direction: 'in', createdAt: new Date(Date.now() - 36 * 3_600_000) }]);
    const r = await svc.preview('c1', 'club1', freshToken());
    expect(r.direction).toBe('in');
  });

  it('confirm recién ahí escribe el fichaje, con la dirección calculada', async () => {
    const { svc, created } = mk([logHoursAgo(1, 'in')]);
    const r = await svc.confirm('c1', 'club1', 'staff1', freshToken());
    expect(r.direction).toBe('out');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ playerId: 'p1', direction: 'out', scannedBy: 'staff1' });
  });
});
