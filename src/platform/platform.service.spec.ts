import { Prisma } from '@prisma/client';

import {
  isBootstrapAdmin,
  PlatformAccessService,
  PlatformAdminGuard,
} from './platform-admin.guard';
import { PlatformService } from './platform.service';

describe('PlatformService (cargos de Fluxion a clubes)', () => {
  let prisma: any;
  let audit: any;
  let service: PlatformService;
  const source = {
    companyId: 'company-a',
    clubId: 'club-a',
    tournamentId: 't1',
    tournamentName: 'Copa Primavera',
  };

  const settingsRow = (publish: number, entry: number) => ({
    id: 'global',
    tournamentPublishFee: new Prisma.Decimal(publish),
    tournamentEntryFee: new Prisma.Decimal(entry),
    currency: 'ARS',
    updatedAt: new Date(),
  });

  beforeEach(() => {
    prisma = {
      platformSettings: {
        upsert: jest.fn().mockResolvedValue(settingsRow(15000, 2000)),
      },
      platformCharge: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ch1', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({ id: 'ch1', status: 'PENDING' }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      financialTransaction: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    audit = { record: jest.fn() };
    service = new PlatformService(prisma, audit);
  });

  it('charges the publication with the current fee and records it in the club treasury', async () => {
    await service.chargeTournamentPublished(source);
    expect(prisma.platformCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: 'club-a',
        kind: 'tournament_published',
        sourceKey: 'tournament:t1',
        amount: 15000,
      }),
    });
    expect(prisma.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'expense',
        category: 'Fluxion · Torneos',
        amount: 15000,
        reference: 'fx:ch1',
      }),
    });
  });

  it('does not charge twice for the same tournament', async () => {
    prisma.platformCharge.findUnique.mockResolvedValue({
      id: 'ch1',
      status: 'PAID',
    });
    await service.chargeTournamentPublished(source);
    expect(prisma.platformCharge.create).not.toHaveBeenCalled();
    expect(prisma.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('skips the charge when the fee is zero', async () => {
    prisma.platformSettings.upsert.mockResolvedValue(settingsRow(0, 0));
    await expect(service.chargeTournamentPublished(source)).resolves.toBeNull();
    expect(prisma.platformCharge.create).not.toHaveBeenCalled();
  });

  it('charges a confirmed entry and voids it (with its treasury line) while unpaid', async () => {
    await service.chargeEntryAccepted({
      ...source,
      entryId: 'e1',
      entryName: 'Los Pibes',
    });
    expect(prisma.platformCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceKey: 'entry:e1', amount: 2000 }),
    });

    prisma.platformCharge.findUnique.mockResolvedValue({
      id: 'ch2',
      status: 'PENDING',
    });
    await service.voidEntryCharge('e1');
    expect(prisma.platformCharge.update).toHaveBeenCalledWith({
      where: { id: 'ch2' },
      data: { status: 'VOIDED' },
    });
    expect(prisma.financialTransaction.deleteMany).toHaveBeenCalledWith({
      where: { reference: 'fx:ch2' },
    });
  });

  it('keeps paid entry charges when the entry is undone', async () => {
    prisma.platformCharge.findUnique.mockResolvedValue({
      id: 'ch2',
      status: 'PAID',
    });
    await service.voidEntryCharge('e1');
    expect(prisma.platformCharge.update).not.toHaveBeenCalled();
  });

  it('marks charges as paid', async () => {
    prisma.platformCharge.findMany = jest.fn().mockResolvedValue([
      { id: 'ch1', status: 'PENDING' },
      { id: 'ch2', status: 'PENDING' },
    ]);
    await service.markCharges(
      { ids: ['ch1', 'ch2'], status: 'PAID' },
      { uid: 'boss' },
    );
    expect(audit.record).toHaveBeenCalledWith(
      { uid: 'boss' },
      'platform.charges.mark',
      expect.anything(),
      expect.objectContaining({
        after: { status: 'PAID', ids: ['ch1', 'ch2'] },
      }),
    );
    expect(prisma.platformCharge.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ch1', 'ch2'] } },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    });
    expect(prisma.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('removes a voided charge from the club treasury and restores it if revived', async () => {
    const row = {
      id: 'ch1',
      status: 'PENDING',
      companyId: 'company-a',
      clubId: 'club-a',
      amount: new Prisma.Decimal(15000),
      currency: 'ARS',
      description: 'Publicación',
    };
    prisma.platformCharge.findMany = jest.fn().mockResolvedValue([row]);
    await service.markCharges({ ids: ['ch1'], status: 'VOIDED' });
    expect(prisma.financialTransaction.deleteMany).toHaveBeenCalledWith({
      where: { reference: { in: ['fx:ch1'] } },
    });

    prisma.platformCharge.findMany.mockResolvedValue([
      { ...row, status: 'VOIDED' },
    ]);
    await service.markCharges({ ids: ['ch1'], status: 'PENDING' });
    expect(prisma.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reference: 'fx:ch1', type: 'expense' }),
    });
  });
});

describe('isBootstrapAdmin', () => {
  afterEach(() => {
    delete process.env.PLATFORM_ADMIN_UIDS;
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });

  it('accepts the Fluxion master account and rejects company admins', () => {
    expect(isBootstrapAdmin({ uid: 'gP2wfenUBpXxvD1BddK6YN5eivW2' })).toBe(
      true,
    );
    expect(
      isBootstrapAdmin({ uid: 'other', role: 'admin', companyId: 'c' }),
    ).toBe(false);
  });

  it('only trusts the email when it is verified', () => {
    expect(
      isBootstrapAdmin({
        uid: 'x',
        email: 'leozman15@gmail.com',
        emailVerified: true,
      }),
    ).toBe(true);
    expect(
      isBootstrapAdmin({
        uid: 'x',
        email: 'leozman15@gmail.com',
        emailVerified: false,
      }),
    ).toBe(false);
  });

  it('can be extended by environment', () => {
    process.env.PLATFORM_ADMIN_UIDS = 'socio-uid';
    expect(isBootstrapAdmin({ uid: 'socio-uid' })).toBe(true);
  });
});

describe('PlatformAdminGuard', () => {
  const run = async (
    admin: { role: string; active: boolean } | null,
    auth: Record<string, unknown>,
    method = 'GET',
  ) => {
    const prisma: any = {
      platformAdmin: { findUnique: jest.fn().mockResolvedValue(admin) },
    };
    const guard = new PlatformAdminGuard(new PlatformAccessService(prisma));
    const context: any = {
      switchToHttp: () => ({ getRequest: () => ({ auth, method }) }),
    };
    return guard.canActivate(context);
  };

  afterEach(() => delete process.env.PLATFORM_REQUIRE_MFA);

  it('lets in active platform admins and keeps company admins out', async () => {
    await expect(
      run({ role: 'SUPERADMIN', active: true }, { uid: 'socio' }, 'POST'),
    ).resolves.toBe(true);
    await expect(
      run(null, { uid: 'admin-empresa', role: 'admin' }),
    ).rejects.toThrow('Solo administradores');
    await expect(
      run({ role: 'SUPERADMIN', active: false }, { uid: 'ex' }),
    ).rejects.toThrow('Solo administradores');
  });

  it('gives SUPPORT read-only access', async () => {
    await expect(
      run({ role: 'SUPPORT', active: true }, { uid: 's' }),
    ).resolves.toBe(true);
    await expect(
      run({ role: 'SUPPORT', active: true }, { uid: 's' }, 'POST'),
    ).rejects.toThrow('solo lectura');
  });

  it('requires a second factor when enabled, even for the master account', async () => {
    process.env.PLATFORM_REQUIRE_MFA = 'true';
    await expect(
      run(null, { uid: 'gP2wfenUBpXxvD1BddK6YN5eivW2' }),
    ).rejects.toThrow('dos pasos');
    await expect(
      run(null, { uid: 'gP2wfenUBpXxvD1BddK6YN5eivW2', mfa: true }),
    ).resolves.toBe(true);
  });
});

describe('settings audit', () => {
  it('records before and after when the fees change', async () => {
    let row = {
      id: 'global',
      tournamentPublishFee: new Prisma.Decimal(0),
      tournamentEntryFee: new Prisma.Decimal(0),
      currency: 'ARS',
      updatedAt: new Date(),
    };
    const prisma: any = {
      platformSettings: {
        upsert: jest.fn().mockImplementation(({ update }) => {
          if (update?.tournamentPublishFee !== undefined)
            row = {
              ...row,
              tournamentPublishFee: new Prisma.Decimal(
                update.tournamentPublishFee,
              ),
            };
          return row;
        }),
      },
    };
    const audit: any = { record: jest.fn() };
    await new PlatformService(prisma, audit).updateSettings(
      { uid: 'boss', email: 'b@f.com' },
      { tournamentPublishFee: 15000 },
    );
    expect(audit.record).toHaveBeenCalledWith(
      { uid: 'boss', email: 'b@f.com' },
      'platform.settings.update',
      { type: 'PlatformSettings', id: 'global' },
      {
        before: { tournamentPublishFee: 0, tournamentEntryFee: 0 },
        after: { tournamentPublishFee: 15000, tournamentEntryFee: 0 },
      },
    );
  });
});
