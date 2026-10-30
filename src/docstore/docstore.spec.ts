jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class {},
}));

import {
  applyUpdate,
  canRead,
  canWrite,
  isDirectionOnly,
  deepMerge,
  isRosterPath,
  parsePath,
  runQuery,
} from './docstore.rules';
import { DocStoreService } from './docstore.service';

const coach = { uid: 'u1', role: 'coach', clubId: 'c1', companyId: 'co' };
const player = { uid: 'u2', role: 'player', clubId: 'c1', companyId: 'co' };

describe('reglas del almacén', () => {
  it('reads paths and keeps the roster out', () => {
    expect(parsePath('clubs/c1/divisions/d1/teams')).toMatchObject({
      kind: 'club',
      clubId: 'c1',
      top: 'divisions',
      isDoc: false,
    });
    expect(isRosterPath(parsePath('clubs/c1/players')!)).toBe(true);
    expect(isRosterPath(parsePath('clubs/c1/players/p1/payments')!)).toBe(
      false,
    );
    expect(isRosterPath(parsePath('clubs/c1/divisions/d1')!)).toBe(true);
    expect(isRosterPath(parsePath('clubs/c1/divisions/d1/teams/t1')!)).toBe(
      false,
    );
    expect(parsePath('clubs/../x')).toBeNull();
  });

  it('lets members read the club news but not the private subtree', () => {
    expect(canRead(coach, 'c1', 'divisions')).toBe(true);
    expect(canRead(player, 'c1', 'special_events')).toBe(true);
    expect(canRead(player, 'c1', 'divisions')).toBe(false);
    expect(canRead(coach, 'c2', 'divisions')).toBe(false);
  });

  it('reserva a la dirección los seguimientos de morosidad y la documentación de atletas', () => {
    const manager = { uid: 'u3', role: 'manager', clubId: 'c1', companyId: 'co' };
    const clubAdmin = { uid: 'u4', role: 'club_admin', clubId: 'c1', companyId: 'co' };
    const coordinator = { uid: 'u5', role: 'coordinator', clubId: 'c1', companyId: 'co' };
    const docsPath = parsePath('clubs/c1/players/p1/documents/dni_front')!;
    const followPath = parsePath('clubs/c1/dues_followups/p1')!;
    const paymentsPath = parsePath('clubs/c1/players/p1/payments')!;
    if (docsPath.kind !== 'club' || followPath.kind !== 'club' || paymentsPath.kind !== 'club')
      throw new Error('ruta inesperada');

    expect(isDirectionOnly(docsPath.top, docsPath.segments)).toBe(true);
    expect(isDirectionOnly(followPath.top, followPath.segments)).toBe(true);
    expect(isDirectionOnly(paymentsPath.top, paymentsPath.segments)).toBe(false);

    for (const path of [docsPath, followPath]) {
      expect(canRead(manager, 'c1', path.top, path.segments)).toBe(true);
      expect(canRead(clubAdmin, 'c1', path.top, path.segments)).toBe(true);
      expect(canRead(coach, 'c1', path.top, path.segments)).toBe(false);
      expect(canRead(coordinator, 'c1', path.top, path.segments)).toBe(false);
      expect(canRead(player, 'c1', path.top, path.segments)).toBe(false);
      expect(canWrite(coach, 'c1', path.top, path.segments)).toBe(false);
      expect(canWrite(manager, 'c1', path.top, path.segments)).toBe(true);
      expect(canRead(manager, 'c2', path.top, path.segments)).toBe(false);
    }
    // El resto del club sigue igual para el personal.
    expect(canRead(coach, 'c1', paymentsPath.top, paymentsPath.segments)).toBe(true);
    expect(canWrite(coach, 'c1', 'divisions')).toBe(true);
    // Consultas de grupo (collectionGroup).
    expect(canRead(coach, 'c1', 'documents')).toBe(false);
    expect(canRead(manager, 'c1', 'documents')).toBe(true);
  });

  it('queries like Firestore: filters, order (dropping missing fields) and limit', () => {
    const rows = [
      {
        id: 'a',
        path: 'x/a',
        data: { type: 'match', date: '2026-10-02', tags: ['x'] },
      },
      { id: 'b', path: 'x/b', data: { type: 'match', date: '2026-10-05' } },
      { id: 'c', path: 'x/c', data: { type: 'training', date: '2026-10-09' } },
      { id: 'd', path: 'x/d', data: { type: 'match' } },
    ];
    expect(
      runQuery(
        rows,
        [{ field: 'type', op: '==', value: 'match' }],
        [{ field: 'date', direction: 'desc' }],
        5,
      ).map((r) => r.id),
    ).toEqual(['b', 'a']);
    expect(
      runQuery(
        rows,
        [{ field: 'tags', op: 'array-contains', value: 'x' }],
        [],
      ).map((r) => r.id),
    ).toEqual(['a']);
    expect(
      runQuery(
        rows,
        [{ field: 'type', op: 'in', value: ['training'] }],
        [],
      ).map((r) => r.id),
    ).toEqual(['c']);
  });

  it('merges and updates nested fields', () => {
    expect(deepMerge({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 3 } })).toEqual({
      a: { x: 1, y: 3 },
      b: 1,
    });
    expect(
      applyUpdate({ stats: { goals: 1, cards: 0 } }, { 'stats.goals': 2 }),
    ).toEqual({ stats: { goals: 2, cards: 0 } });
  });
});

describe('DocStoreService', () => {
  function setup(existing: Record<string, any> | null = null) {
    const prisma: any = {
      club: { findUnique: jest.fn().mockResolvedValue({ companyId: 'co' }) },
      storeDocument: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn().mockResolvedValue([
          {
            docId: 't1',
            path: 'clubs/c1/divisions/d1/teams/t1',
            data: { name: 'Primera' },
          },
          {
            docId: 't2',
            path: 'clubs/c1/divisions/d1/teams/t2',
            data: { name: 'Reserva' },
          },
        ]),
        upsert: jest.fn().mockImplementation(({ create }) => ({
          docId: create.docId,
          path: create.path,
          data: create.data,
        })),
        delete: jest.fn(),
      },
    };
    const migration = { ensureStage2: jest.fn() };
    const media = {
      hasDataImage: (v: unknown) =>
        JSON.stringify(v ?? null).includes('"data:image/'),
      externalizeDeep: jest.fn(async (v: Record<string, unknown>) => {
        for (const k of Object.keys(v))
          if (typeof v[k] === 'string' && v[k].startsWith('data:image/'))
            v[k] = 'https://storage.test/foto.webp';
        return v;
      }),
    };
    return {
      prisma,
      media,
      service: new DocStoreService(prisma, migration as any, media as any),
    };
  }

  it('lists a collection for staff and refuses players', async () => {
    const { service } = setup();
    const rows = await service.query(coach, {
      path: 'clubs/c1/divisions/d1/teams',
      orderBy: [{ field: 'name', direction: 'asc' }],
    });
    expect(rows.map((row) => row.data.name)).toEqual(['Primera', 'Reserva']);
    await expect(
      service.query(player, { path: 'clubs/c1/divisions/d1/teams' }),
    ).rejects.toThrow('Sin permiso');
  });

  it('writes with the club and parent of the path', async () => {
    const { prisma, service } = setup();
    await service.set(coach, 'clubs/c1/divisions/d1/teams/t9', {
      name: 'Sub 15',
    });
    expect(prisma.storeDocument.upsert.mock.calls[0][0].create).toMatchObject({
      path: 'clubs/c1/divisions/d1/teams/t9',
      parentPath: 'clubs/c1/divisions/d1/teams',
      collection: 'teams',
      docId: 't9',
      clubId: 'c1',
    });
    await expect(
      service.set(player, 'clubs/c1/divisions/d1/teams/t9', { name: 'x' }),
    ).rejects.toThrow('Sin permiso');
    await expect(
      service.set(coach, 'clubs/c1/players/p1', { name: 'x' }),
    ).rejects.toThrow('padrón');
  });

  it('uploads base64 photos and stores only the link', async () => {
    const { prisma, media, service } = setup();
    await service.set(coach, 'clubs/c1/coaches/k1', {
      name: 'Profe',
      photoUrl: 'data:image/webp;base64,AAAA',
    });
    expect(media.externalizeDeep).toHaveBeenCalledWith(
      expect.anything(),
      'clubs/c1/coaches',
    );
    expect(prisma.storeDocument.upsert.mock.calls[0][0].create.data).toEqual({
      name: 'Profe',
      photoUrl: 'https://storage.test/foto.webp',
    });
  });

  it('only shows staff users of the own club', async () => {
    const { prisma, service } = setup();
    prisma.storeDocument.findMany.mockResolvedValueOnce([
      { docId: 'u1', path: 'users/u1', data: { clubId: 'c1', name: 'Yo' } },
      {
        docId: 'x',
        path: 'users/x',
        data: { clubId: 'c2', name: 'Otro club' },
      },
      {
        docId: 'y',
        path: 'users/y',
        data: { clubId: 'c1', name: 'Compañero' },
      },
    ]);
    const rows = await service.query(coach, { path: 'users' });
    expect(rows.map((row) => row.id)).toEqual(['u1', 'y']);
  });
});
