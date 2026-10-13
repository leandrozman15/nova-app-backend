import { Prisma } from '@prisma/client';

import { isPlatformAdmin } from './platform-admin.guard';
import { PlatformService } from './platform.service';

describe('PlatformService (cargos de Fluxion a clubes)', () => {
  let prisma: any;
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
    service = new PlatformService(prisma);
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
    await service.markCharges({ ids: ['ch1', 'ch2'], status: 'PAID' });
    expect(prisma.platformCharge.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ch1', 'ch2'] } },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    });
  });
});

describe('isPlatformAdmin', () => {
  afterEach(() => {
    delete process.env.PLATFORM_ADMIN_UIDS;
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });

  it('accepts the Fluxion master account and rejects company admins', () => {
    expect(isPlatformAdmin({ uid: 'gP2wfenUBpXxvD1BddK6YN5eivW2' })).toBe(true);
    expect(
      isPlatformAdmin({ uid: 'other', role: 'admin', companyId: 'c' }),
    ).toBe(false);
  });

  it('only trusts the email when it is verified', () => {
    expect(
      isPlatformAdmin({
        uid: 'x',
        email: 'leozman15@gmail.com',
        emailVerified: true,
      }),
    ).toBe(true);
    expect(
      isPlatformAdmin({
        uid: 'x',
        email: 'leozman15@gmail.com',
        emailVerified: false,
      }),
    ).toBe(false);
  });

  it('can be extended by environment', () => {
    process.env.PLATFORM_ADMIN_UIDS = 'socio-uid';
    expect(isPlatformAdmin({ uid: 'socio-uid' })).toBe(true);
  });
});
