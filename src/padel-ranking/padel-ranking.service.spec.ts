import { ConflictException } from '@nestjs/common';

import { dniHash } from '../common/pii-crypto';
import { PadelRankingService } from './padel-ranking.service';

process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const mk = (profiles: Record<string, any>) => {
  const prisma: any = {
    padelProfile: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.userId ? profiles[`u:${where.userId}`] ?? null : Object.values(profiles).find((p: any) => p.dniHash === where.dniHash) ?? null,
      ),
    },
  };
  return new PadelRankingService(prisma);
};
const me = { 'u:me': { displayName: 'Yo', category: '7MA', dniHash: dniHash('30111222') } };

describe('inscripción con control de categoría', () => {
  it('sin reglas no pide nada', async () => {
    await expect(mk({}).validateEntry('me', { mode: null })).resolves.toEqual({ partnerDniHash: null });
  });

  it('pide que declare su categoría', async () => {
    await expect(mk({}).validateEntry('me', { mode: 'category', category: '7MA' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('bloquea a un 4ta anotado en 7ma', async () => {
    const svc = mk({ 'u:me': { displayName: 'Fran', category: '4TA', dniHash: dniHash('30111222') } });
    await expect(svc.validateEntry('me', { mode: 'category', category: '7MA' })).rejects.toThrow(/no puede jugar para abajo/);
  });

  it('suma: exige compañero y controla el tope', async () => {
    const svc = mk({ ...me, p2: { displayName: 'Pro', category: '1RA', dniHash: dniHash('20333444') } });
    await expect(svc.validateEntry('me', { mode: 'suma', sum: 11, top: '4TA' })).rejects.toThrow(/compañero/);
    await expect(svc.validateEntry('me', { mode: 'suma', sum: 11, top: '4TA' }, '20.333.444')).rejects.toThrow(/tope/);
  });

  it('deja pasar una pareja válida y devuelve el hash del compañero', async () => {
    const svc = mk({ ...me, p2: { displayName: 'Ami', category: '8VA', dniHash: dniHash('20333444') } });
    const r = await svc.validateEntry('me', { mode: 'category', category: '7MA' }, '20333444');
    expect(r.partnerDniHash).toBe(dniHash('20333444'));
  });
});
