jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class {},
}));

import { FirestoreMigrationService } from './firestore-migration.service';
import {
  divisionData,
  parseDay,
  playerData,
  toPlayerDoc,
} from './roster.mapper';
import { RosterService } from './roster.service';

describe('padrón: forma de la ficha', () => {
  it('separates known columns from extra fields and keeps previous extras', () => {
    const data = playerData(
      {
        firstName: ' Ana ',
        lastName: 'Paz',
        dni: '45.123.456',
        birthDate: '03/05/2011',
        hasMinorAuth: 'true',
        teamId: 't1',
        jersey: 10,
        id: 'x',
        divisionName: 'Sub 15',
      },
      { teamName: 'Primera' },
    );
    expect(data).toMatchObject({
      firstName: 'Ana',
      lastName: 'Paz',
      dni: '45123456',
      hasMinorAuth: true,
    });
    expect((data.birthDate as Date).toISOString().slice(0, 10)).toBe(
      '2011-05-03',
    );
    expect(data.extra).toEqual({
      teamName: 'Primera',
      teamId: 't1',
      jersey: 10,
    });
    expect(
      divisionData({ name: 'Sub 15', minAge: '13', color: 'azul' }),
    ).toEqual({ name: 'Sub 15', minAge: 13, extra: { color: 'azul' } });
    expect(parseDay('2011-02-31')).toBeNull();
  });

  it('answers with the id the console already uses', () => {
    const doc = toPlayerDoc({
      id: 'pg1',
      legacyId: 'fs1',
      authUid: null,
      email: null,
      photoUrl: null,
      firstName: 'Ana',
      lastName: 'Paz',
      dni: '1',
      dniHash: null,
      birthDateEnc: null,
      position: null,
      birthDate: new Date('2011-05-03T12:00:00Z'),
      phone: null,
      address: null,
      locality: null,
      province: null,
      active: true,
      companyId: 'co',
      clubId: 'c1',
      teamId: null,
      membershipTier: null,
      membershipCategory: null,
      membershipPlanId: null,
      isFamilyPlan: false,
      parking: false,
      paymentMethod: null,
      notes: null,
      facilitiesAccess: null,
      extrasAccess: null,
      familyMembers: null,
      sport: 'boxeo',
      divisionId: 'd1',
      branch: 'mixto',
      gender: 'Femenino',
      membershipNumber: null,
      hasMedicalCert: false,
      hasMinorAuth: false,
      isFan: false,
      status: 'active',
      role: null,
      extra: { teamId: 't9' },
      createdAt: new Date(),
      updatedAt: new Date(),
      division: { name: 'Sub 15' },
    });
    expect(doc).toMatchObject({
      id: 'fs1',
      backendId: 'pg1',
      birthDate: '2011-05-03',
      divisionName: 'Sub 15',
      teamId: 't9',
      role: 'player',
    });
  });
});

describe('copia de Firestore', () => {
  function firestore(players: Array<Record<string, unknown> & { id: string }>) {
    const snap = (items: Array<Record<string, unknown> & { id: string }>) => ({
      docs: items.map((item) => ({ id: item.id, data: () => item })),
    });
    const collections: Record<string, any> = {
      available_disciplines: snap([
        { id: 'boxeo', sportId: 'boxeo', customName: 'Boxeo', minAge: '12' },
      ]),
      divisions: snap([{ id: 'd1', name: 'Recreativo', sport: 'boxeo' }]),
      players: snap(players),
    };
    return {
      firestore: {
        collection: () => ({
          doc: () => ({
            collection: (name: string) => ({
              get: async () => collections[name],
            }),
          }),
        }),
      },
    };
  }

  it('merges a player that already exists in the roster by DNI and creates the rest', async () => {
    const prisma: any = {
      club: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c1',
          name: 'Club',
          companyId: 'co',
          firestoreMigration: null,
        }),
        update: jest.fn(),
      },
      clubDiscipline: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ sportId: 'boxeo' }]),
      },
      division: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      player: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          where.OR.some((item: any) => item.dni === '30111222')
            ? {
                id: 'pg7',
                legacyId: null,
                extra: null,
                firstName: 'Juan',
                email: 'j@x.com',
                authUid: null,
              }
            : null,
        ),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const service = new FirestoreMigrationService(
      prisma,
      firestore([
        {
          id: 'fsA',
          firstName: 'Juan',
          lastName: 'Pérez',
          dni: '30.111.222',
          divisionId: 'd1',
          sport: 'boxeo',
          email: 'otro@x.com',
          teamId: 't1',
        },
        {
          id: 'fsB',
          firstName: 'Lía',
          lastName: 'Sosa',
          dni: '41000111',
          divisionId: 'gone',
        },
      ]) as any,
    );
    const report = await service.stage1('c1');
    expect(report.players).toEqual({ created: 1, merged: 1, failed: 0 });
    expect(prisma.clubDiscipline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'c1_boxeo',
        sportId: 'boxeo',
        name: 'Boxeo',
        minAge: 12,
        clubId: 'c1',
      }),
    });
    const merged = prisma.player.update.mock.calls[0][0];
    expect(merged.where).toEqual({ id: 'pg7' });
    expect(merged.data).toMatchObject({
      legacyId: 'fsA',
      divisionId: 'd1',
      sport: 'boxeo',
    });
    expect(merged.data.email).toBeUndefined();
    const created = prisma.player.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      id: 'fsB',
      firstName: 'Lía',
      clubId: 'c1',
      companyId: 'co',
    });
    expect(created.divisionId).toBeUndefined();
    expect(created.extra).toMatchObject({ legacyDivisionId: 'gone' });
    expect(prisma.club.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { sport: 'boxeo' },
    });
  });
});

describe('RosterService', () => {
  it('lets a player see only their own record and change only the photo', async () => {
    const own = {
      id: 'pg1',
      legacyId: 'uid-1',
      authUid: null,
      email: null,
      extra: null,
      clubId: 'c1',
      firstName: 'A',
      lastName: 'B',
      createdAt: new Date(),
      updatedAt: new Date(),
      birthDate: null,
    } as any;
    const prisma: any = {
      club: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'c1', companyId: 'co', name: 'Club' }),
      },
      player: {
        findFirst: jest.fn().mockResolvedValue(own),
        update: jest.fn().mockResolvedValue(own),
      },
    };
    const service = new RosterService(
      prisma,
      { ensureStage1: jest.fn() } as any,
      { externalizeDeep: jest.fn(async (v: unknown) => v) } as any,
    );
    await expect(
      service.listPlayers('co', 'c1', { uid: 'uid-1', role: 'player' }, {}),
    ).rejects.toThrow('Solo el staff');
    await service.updatePlayer(
      'co',
      'c1',
      'uid-1',
      { photoUrl: 'https://x/y.webp', status: 'inactive' },
      { uid: 'uid-1', role: 'player' },
    );
    expect(prisma.player.update.mock.calls[0][0].data).toEqual({
      photoUrl: 'https://x/y.webp',
    });
    await expect(
      service.getPlayer('co', 'c1', 'uid-1', {
        uid: 'someone-else',
        role: 'player',
      }),
    ).rejects.toThrow('No podés ver');
  });
});
