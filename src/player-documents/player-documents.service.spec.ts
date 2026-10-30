jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class {},
}));

const saved: { path: string; data: Buffer }[] = [];
const deleted: string[] = [];
const signed: { path: string; opts: Record<string, unknown> }[] = [];
jest.mock('firebase-admin/app', () => ({ getApp: () => ({}) }));
jest.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      name: 'b',
      file: (path: string) => ({
        save: (data: Buffer) => {
          saved.push({ path, data });
          return Promise.resolve();
        },
        delete: () => {
          deleted.push(path);
          return Promise.resolve();
        },
        getSignedUrl: (opts: Record<string, unknown>) => {
          signed.push({ path, opts });
          return Promise.resolve([`https://signed.example/${path}`]);
        },
      }),
    }),
  }),
}));

import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { PlayerDocumentsService } from './player-documents.service';

const manager = { uid: 'm1', role: 'manager', clubId: 'c1', companyId: 'co' };
const coach = { uid: 'k1', role: 'coach', clubId: 'c1', companyId: 'co' };

function build() {
  const rows = new Map<string, unknown>();
  const store = {
    get: jest.fn((_v: unknown, path: string) =>
      Promise.resolve(
        rows.has(path) ? { id: path, path, data: rows.get(path) } : null,
      ),
    ),
    set: jest.fn((_v: unknown, path: string, data: unknown) => {
      rows.set(path, data);
      return Promise.resolve({});
    }),
    remove: jest.fn((_v: unknown, path: string) => {
      rows.delete(path);
      return Promise.resolve({ ok: true });
    }),
  };
  const prisma = {
    player: { findFirst: jest.fn(() => Promise.resolve({ id: 'p1' })) },
  };
  const service = new PlayerDocumentsService(
    prisma as never,
    store as never,
    { get: () => undefined } as never,
  );
  return { service, rows, store, prisma };
}

const png = Buffer.from('89504e470d0a1a0a0000', 'hex').toString('base64');
const dto = (extra: object = {}) => ({
  clubId: 'c1',
  docId: 'dni_front',
  slot: 'dni_front',
  fileName: 'dni.png',
  contentType: 'image/png',
  dataBase64: png,
  ...extra,
});
const consent = {
  acceptedBy: 'Ana',
  relationship: 'madre',
  textVersion: '2026-10',
};

describe('PlayerDocumentsService', () => {
  beforeEach(() => {
    saved.length = 0;
    deleted.length = 0;
    signed.length = 0;
  });

  it('solo la dirección puede subir', async () => {
    const { service } = build();
    await expect(
      service.upload(coach, undefined, 'p1', dto({ consent }) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige consentimiento la primera vez y lo guarda una sola vez', async () => {
    const { service, rows } = build();
    await expect(
      service.upload(manager, 'm@x.com', 'p1', dto() as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.upload(manager, 'm@x.com', 'p1', dto({ consent }));
    expect(rows.get('clubs/c1/players/p1/documents/consent')).toMatchObject({
      acceptedBy: 'Ana',
      relationship: 'madre',
    });
    // segundo documento: ya no pide consentimiento
    await service.upload(
      manager,
      'm@x.com',
      'p1',
      dto({ docId: 'dni_back', slot: 'dni_back' }),
    );
    expect(saved).toHaveLength(2);
    expect(saved[0].path).toContain(
      'private/clubs/c1/players/p1/documents/dni_front-',
    );
  });

  it('no guarda un enlace permanente en los metadatos', async () => {
    const { service, rows } = build();
    await service.upload(manager, undefined, 'p1', dto({ consent }));
    const meta = rows.get('clubs/c1/players/p1/documents/dni_front') as Record<
      string,
      unknown
    >;
    expect(meta.storagePath).toBeDefined();
    expect(meta.url).toBeUndefined();
  });

  it('el enlace vence a los 5 minutos y se registra el acceso', async () => {
    const { service, rows } = build();
    await service.upload(manager, 'm@x.com', 'p1', dto({ consent }));
    const before = Date.now();
    const out = await service.signedUrl(
      manager,
      'm@x.com',
      'c1',
      'p1',
      'dni_front',
      'download',
      'Perez DNI.png',
    );
    expect(out.expiresInSeconds).toBe(300);
    expect(signed[0].opts.version).toBe('v4');
    expect(Number(signed[0].opts.expires) - before).toBeLessThanOrEqual(
      5 * 60_000 + 50,
    );
    expect(String(signed[0].opts.responseDisposition)).toContain('attachment');
    const logs = [...rows.entries()].filter(([k]) =>
      k.includes('document_access_log'),
    );
    expect(logs.map(([, v]) => (v as { action: string }).action)).toEqual([
      'upload',
      'download',
    ]);
    expect((logs[1][1] as { byEmail: string }).byEmail).toBe('m@x.com');
  });

  it('rechaza archivos cuyo contenido no es el declarado', async () => {
    const { service } = build();
    await expect(
      service.upload(
        manager,
        undefined,
        'p1',
        dto({ consent, contentType: 'application/pdf' }) as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('al borrar elimina el archivo y deja registro', async () => {
    const { service, rows } = build();
    await service.upload(manager, undefined, 'p1', dto({ consent }));
    await service.remove(manager, undefined, 'c1', 'p1', 'dni_front');
    expect(deleted).toHaveLength(1);
    expect(rows.has('clubs/c1/players/p1/documents/dni_front')).toBe(false);
    const actions = [...rows.entries()]
      .filter(([k]) => k.includes('document_access_log'))
      .map(([, v]) => (v as { action: string }).action);
    expect(actions).toEqual(['upload', 'delete']);
  });
});
