import { Prisma } from '@prisma/client';

import { CommissionsService } from './commissions.service';
import { MerchantPortalService } from './merchant-portal.service';
import { hashToken, MerchantsService } from './merchants.service';
import { StoreOrdersService } from './store-orders.service';

const actor = { uid: 'admin-uid', email: 'admin@fluxion.app' };
const D = (value: number) => new Prisma.Decimal(value);

const globalRule = {
  id: 'g1',
  scope: 'GLOBAL',
  clubId: null,
  merchantId: null,
  platformPercent: D(5),
  clubPercent: D(2),
  version: 1,
};

function settingsRow() {
  return {
    id: 'global',
    commissionPlatformMin: D(0),
    commissionPlatformMax: D(30),
    commissionClubMin: D(0),
    commissionClubMax: D(15),
  };
}

function makePrisma(extra: Record<string, unknown> = {}) {
  const prisma: any = {
    commissionRule: {
      findMany: jest.fn().mockResolvedValue([globalRule]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'new-rule', ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    platformSettings: { upsert: jest.fn().mockResolvedValue(settingsRow()) },
    club: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    merchant: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    merchantInvitation: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'inv1',
        email: data.email,
        role: data.role,
        expiresAt: data.expiresAt,
      })),
      findUnique: jest.fn(),
    },
    merchantMember: { upsert: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn() },
    ...extra,
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe('CommissionsService', () => {
  it('creates a new version and closes the current one, with audit', async () => {
    const prisma = makePrisma();
    prisma.commissionRule.findFirst
      .mockResolvedValueOnce(globalRule) // vigente
      .mockResolvedValueOnce({ version: 1 }); // última versión
    const audit = { record: jest.fn() };
    const service = new CommissionsService(prisma, audit as any);

    await service.setRule(actor, {
      scope: 'GLOBAL',
      platformPercent: 6,
      clubPercent: 2,
      reason: 'Ajuste anual',
    });

    expect(prisma.commissionRule.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { validTo: expect.any(Date) },
    });
    expect(prisma.commissionRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: 'GLOBAL',
        platformPercent: 6,
        clubPercent: 2,
        version: 2,
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      'commission.rule.set',
      { type: 'CommissionRule', id: 'new-rule' },
      expect.objectContaining({
        before: expect.objectContaining({ platformPercent: 5 }),
        after: expect.objectContaining({ platformPercent: 6 }),
        reason: 'Ajuste anual',
      }),
    );
  });

  it('refuses a merchant commission below the club share', async () => {
    const prisma = makePrisma();
    prisma.merchant.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.merchant.findMany.mockResolvedValue([
      { id: 'm1', tradeName: 'Deportes Sur' },
    ]);
    const service = new CommissionsService(prisma, {
      record: jest.fn(),
    } as any);

    await expect(
      service.setRule(actor, {
        scope: 'MERCHANT',
        merchantId: 'm1',
        platformPercent: 1.5,
        reason: 'Promo',
      }),
    ).rejects.toThrow(/Deportes Sur paga 1.5%/);
    expect(prisma.commissionRule.create).not.toHaveBeenCalled();
  });
});

describe('MerchantsService', () => {
  const commissions = {
    currentRules: jest.fn().mockResolvedValue([]),
    setRule: jest.fn(),
    checkNewMerchant: jest.fn(),
  };

  it('rejects an invalid CUIT', async () => {
    const service = new MerchantsService(
      makePrisma(),
      { record: jest.fn() } as any,
      commissions as any,
    );
    await expect(
      service.create(actor, {
        legalName: 'Deportes Sur SRL',
        tradeName: 'Deportes Sur',
        cuit: '20-12345678-0',
        ivaCondition: 'MONOTRIBUTO',
        contactEmail: 'dueno@sur.com',
      }),
    ).rejects.toThrow(/CUIT no es válido/);
  });

  it('creates the merchant as INVITADO with a hashed single-use invitation', async () => {
    const prisma = makePrisma();
    const merchant = {
      id: 'm1',
      legalName: 'Deportes Sur SRL',
      tradeName: 'Deportes Sur',
      cuit: '20123456786',
      ivaCondition: 'MONOTRIBUTO',
      contactEmail: 'dueno@sur.com',
      categories: [],
      status: 'INVITADO',
    };
    prisma.merchant.findUnique.mockImplementation(({ where }: any) =>
      where.cuit
        ? null
        : {
            ...merchant,
            members: [],
            invitations: [],
            paymentAccount: null,
            _count: { products: 0, orders: 0 },
            cuitVerifiedAt: null,
          },
    );
    prisma.merchant.create.mockResolvedValue(merchant);
    const audit = { record: jest.fn() };
    const service = new MerchantsService(
      prisma,
      audit as any,
      commissions as any,
    );

    const result = await service.create(actor, {
      legalName: 'Deportes Sur SRL',
      tradeName: 'Deportes Sur',
      cuit: '20-12345678-6',
      ivaCondition: 'MONOTRIBUTO',
      contactEmail: 'Dueno@Sur.com',
    });

    expect(prisma.merchant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cuit: '20123456786',
        contactEmail: 'dueno@sur.com',
        createdByUid: 'admin-uid',
      }),
    });
    const created = prisma.merchantInvitation.create.mock.calls[0][0].data;
    expect(result.invitation.token).toHaveLength(43);
    expect(created.tokenHash).toBe(hashToken(result.invitation.token));
    expect(created).not.toHaveProperty('token');
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      'merchant.create',
      { type: 'Merchant', id: 'm1' },
      expect.anything(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      'merchant.invite',
      { type: 'Merchant', id: 'm1' },
      expect.anything(),
    );
  });

  it('activates only when CUIT, owner and payment account are ready', async () => {
    const prisma = makePrisma();
    const audit = { record: jest.fn() };
    const service = new MerchantsService(
      prisma,
      audit as any,
      commissions as any,
    );
    prisma.merchant.findUnique.mockResolvedValueOnce({
      id: 'm1',
      status: 'INVITADO',
      cuitVerifiedAt: null,
      members: [{ role: 'ADMIN_COMERCIO', active: true }],
      paymentAccount: { status: 'CONNECTED' },
    });
    expect(await service.maybeActivate(actor, 'm1')).toBe(false);

    prisma.merchant.findUnique.mockResolvedValueOnce({
      id: 'm1',
      status: 'INVITADO',
      cuitVerifiedAt: new Date(),
      members: [{ role: 'ADMIN_COMERCIO', active: true }],
      paymentAccount: { status: 'CONNECTED' },
    });
    expect(await service.maybeActivate(actor, 'm1')).toBe(true);
    expect(prisma.merchant.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'INVITADO' },
      data: { status: 'ACTIVO', activatedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      'merchant.activate',
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('MerchantPortalService.accept', () => {
  const invitation = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv1',
    merchantId: 'm1',
    email: 'dueno@sur.com',
    role: 'ADMIN_COMERCIO',
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    revokedAt: null,
    merchant: { id: 'm1', status: 'INVITADO' },
    ...overrides,
  });

  function setup() {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'dueno@sur.com',
    });
    const merchants = { maybeActivate: jest.fn() };
    const service = new MerchantPortalService(
      prisma,
      { record: jest.fn() } as any,
      merchants as any,
      {} as any,
    );
    return { prisma, service, merchants };
  }

  it('requires the invited email', async () => {
    const { prisma, service } = setup();
    prisma.merchantInvitation.findUnique.mockResolvedValue(invitation());
    await expect(
      service.accept({ uid: 'u', email: 'otro@mail.com' }, 'x'.repeat(43)),
    ).rejects.toThrow(/du•+@sur.com/);
  });

  it('rejects expired invitations', async () => {
    const { prisma, service } = setup();
    prisma.merchantInvitation.findUnique.mockResolvedValue(
      invitation({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      service.accept({ uid: 'u', email: 'dueno@sur.com' }, 'x'.repeat(43)),
    ).rejects.toThrow(/venció/);
  });

  it('is single use even with two simultaneous clicks', async () => {
    const { prisma, service } = setup();
    prisma.merchantInvitation.findUnique.mockResolvedValue(invitation());
    prisma.merchantInvitation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.accept({ uid: 'u', email: 'dueno@sur.com' }, 'x'.repeat(43)),
    ).rejects.toThrow(/ya se usó/);
    expect(prisma.merchantMember.upsert).not.toHaveBeenCalled();
  });

  it('adds the member with the invited role and tries to activate', async () => {
    const { prisma, service, merchants } = setup();
    prisma.merchantInvitation.findUnique.mockResolvedValue(invitation());
    await service.accept({ uid: 'u', email: 'DUENO@sur.com' }, 'x'.repeat(43));
    expect(prisma.merchantMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { merchantId: 'm1', userId: 'u1', role: 'ADMIN_COMERCIO' },
      }),
    );
    expect(merchants.maybeActivate).toHaveBeenCalledWith(
      expect.anything(),
      'm1',
    );
  });
});

describe('StoreOrdersService', () => {
  const club = {
    id: 'c1',
    name: 'Club Norte',
    companyId: 'co1',
    timezone: 'America/Argentina/Buenos_Aires',
    publicShop: false,
    storeSettings: {
      acceptMerchants: true,
      paused: false,
      excludedCategories: ['bebidas'],
      dailyCapacity: null,
    },
  };
  const product = {
    id: 'p1',
    merchantId: 'm1',
    name: 'Pelota N5',
    category: 'equipamiento',
    price: D(20000),
    merchant: { id: 'm1', status: 'ACTIVO', tradeName: 'Deportes Sur' },
  };

  function setup() {
    const prisma = makePrisma({
      storeProduct: {
        findMany: jest.fn().mockResolvedValue([product]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      storeOrder: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => ({
          ...data,
          id: 'o1',
          status: 'PLACED',
          merchant: { id: 'm1', tradeName: 'Deportes Sur' },
          sellerClub: null,
          pickupClub: { id: 'c1', name: 'Club Norte' },
          items: data.items.create,
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'o1',
          sellerType: 'MERCHANT',
          subtotal: D(1),
          platformPercent: D(5),
          clubPercent: D(2),
          platformAmount: D(0),
          clubAmount: D(0),
          sellerAmount: D(1),
          merchant: { id: 'm1', tradeName: 'Deportes Sur' },
          items: [],
        }),
      },
      storeOrderItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { productId: 'p1', clubProductId: null, size: null, quantity: 2 },
          ]),
      },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Ana',
      email: 'ana@mail.com',
      phone: '1155',
    });
    prisma.club.findFirst = jest.fn().mockResolvedValue(club);
    const commissions = new CommissionsService(prisma, {
      record: jest.fn(),
    } as any);
    return { prisma, service: new StoreOrdersService(prisma, commissions) };
  }

  it('creates the order with the commission snapshot and decrements stock atomically', async () => {
    const { prisma, service } = setup();
    const order = await service.create('uid', {
      pickupClubId: 'c1',
      items: [{ productId: 'p1', quantity: 2 }],
    });

    expect(prisma.storeProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', active: true, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(prisma.storeOrder.create.mock.calls[0][0].data).toMatchObject({
      sellerType: 'MERCHANT',
      merchantId: 'm1',
      pickupClubId: 'c1',
      subtotal: 40000,
      platformPercent: 5,
      clubPercent: 2,
      platformAmount: 2000,
      clubAmount: 800,
      sellerAmount: 38000,
      commissionRules: { platform: { id: 'g1', scope: 'GLOBAL', version: 1 } },
    });
    expect(order.pickupCode).toMatch(/^\d{6}$/);
    expect(order.fluxionAmount).toBe(1200);
  });

  it('does not create the order when stock runs out', async () => {
    const { prisma, service } = setup();
    prisma.storeProduct.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.create('uid', {
        pickupClubId: 'c1',
        items: [{ productId: 'p1', quantity: 2 }],
      }),
    ).rejects.toThrow(/Sin stock suficiente de Pelota N5/);
    expect(prisma.storeOrder.create).not.toHaveBeenCalled();
  });

  it('respects the club excluded categories and daily capacity', async () => {
    const { prisma, service } = setup();
    prisma.storeProduct.findMany.mockResolvedValue([
      { ...product, category: 'bebidas' },
    ]);
    await expect(
      service.create('uid', {
        pickupClubId: 'c1',
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow(/no recibe productos de ese rubro/);

    prisma.storeProduct.findMany.mockResolvedValue([product]);
    prisma.club.findFirst.mockResolvedValue({
      ...club,
      storeSettings: { ...club.storeSettings, dailyCapacity: 3 },
    });
    prisma.storeOrder.count.mockResolvedValue(3);
    await expect(
      service.create('uid', {
        pickupClubId: 'c1',
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow(/completó los retiros de hoy/);
  });

  it('requires a phone to buy', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Ana',
      email: 'a@b.c',
      phone: null,
    });
    await expect(
      service.create('uid', {
        pickupClubId: 'c1',
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toThrow(/teléfono/);
  });

  it('cancelling voids the commission and returns the stock', async () => {
    const { prisma, service } = setup();
    await service.transition('o1', 'cancel', { reason: 'Sin retirar' });
    expect(prisma.storeOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['PLACED', 'CONFIRMED', 'AT_CLUB'] } },
      data: expect.objectContaining({
        status: 'CANCELLED',
        commissionStatus: 'VOID',
        cancelReason: 'Sin retirar',
      }),
    });
    expect(prisma.storeProduct.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stock: { increment: 2 } },
    });
  });

  it('delivering accrues the commission; a stale state is rejected', async () => {
    const { prisma, service } = setup();
    await service.transition('o1', 'deliver');
    expect(prisma.storeOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['AT_CLUB', 'CONFIRMED'] } },
      data: expect.objectContaining({
        status: 'DELIVERED',
        commissionStatus: 'ACCRUED',
      }),
    });
    prisma.storeOrder.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.transition('o1', 'deliver')).rejects.toThrow(
      /cambió de estado/,
    );
  });

  it('delivery needs the buyer code and, for merchants, the drop-off first', async () => {
    const { prisma, service } = setup();
    prisma.storeOrder.findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'o1',
        status: 'CONFIRMED',
        sellerType: 'MERCHANT',
        pickupCode: '123456',
      })
      .mockResolvedValueOnce({
        id: 'o1',
        status: 'AT_CLUB',
        sellerType: 'MERCHANT',
        pickupCode: '123456',
      });
    await expect(service.deliver('c1', 'o1', '123456')).rejects.toThrow(
      /dejó el pedido/,
    );
    await expect(service.deliver('c1', 'o1', '000000')).rejects.toThrow(
      /no coincide/,
    );
  });
});
