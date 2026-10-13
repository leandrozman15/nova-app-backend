import { Prisma } from '@prisma/client';

import { AgendaService, previousMonth } from './agenda.service';
import { occurrenceDates } from './fixed-turns';

const TZ = 'America/Argentina/Buenos_Aires';

const club = {
  id: 'c1',
  timezone: TZ,
  openMinute: 480,
  closeMinute: 1440,
  bookingMode: 'request',
  requireDeposit: true,
  depositPercent: 50,
  depositAlias: 'club.canchas',
  depositHoldHours: 12,
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'b1',
  facilityId: 'f1',
  date: '2026-10-20',
  startMinute: 1260,
  durationMinutes: 60,
  status: 'CONFIRMED',
  source: 'APP',
  kind: 'ALQUILER',
  price: new Prisma.Decimal(24000),
  depositAmount: new Prisma.Decimal(12000),
  paidAmount: new Prisma.Decimal(0),
  depositPaidAt: null,
  depositMethod: null,
  paymentMethod: null,
  attendance: null,
  contactName: 'Juan',
  contactPhone: null,
  notes: null,
  holdExpiresAt: new Date(),
  recurringId: null,
  mpPaymentId: null,
  createdAt: new Date(),
  user: null,
  ...overrides,
});

function setup() {
  const prisma: any = {
    club: {
      findFirst: jest.fn().mockResolvedValue(club),
      findUnique: jest.fn().mockResolvedValue({ companyId: 'co1', timezone: TZ }),
      update: jest.fn(),
    },
    facility: {
      findFirst: jest.fn().mockResolvedValue({ id: 'f1', name: 'Cancha 1', hourlyPrice: new Prisma.Decimal(24000), slotDurations: [60, 90] }),
      findMany: jest.fn().mockResolvedValue([{ id: 'f1', name: 'Cancha 1', bookable: true }]),
      findUnique: jest.fn().mockResolvedValue({ name: 'Cancha 1' }),
      update: jest.fn(),
    },
    recurringBooking: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'fx1', endDate: null, ...data, price: new Prisma.Decimal(data.price) })),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    booking: {
      create: jest.fn().mockResolvedValue(row({ source: 'CLUB' })),
      findFirst: jest.fn().mockResolvedValue({
        id: 'b1',
        companyId: 'co1',
        clubId: 'c1',
        facilityId: 'f1',
        date: '2026-10-20',
        startMinute: 1260,
        status: 'PENDING_PAYMENT',
        depositAmount: new Prisma.Decimal(12000),
        depositPaidAt: null,
        depositMethod: null,
        attendance: null,
        contactName: 'Juan',
        currency: 'ARS',
        recurringId: null,
      }),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    financialTransaction: { create: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  const bookings: any = {
    expireStaleHolds: jest.fn(),
    confirmByClub: jest.fn(),
    cancelByClub: jest.fn().mockResolvedValue({ ok: true, refunded: false }),
  };
  return { prisma, bookings, service: new AgendaService(prisma, bookings) };
}

describe('AgendaService', () => {
  it('registers a cash deposit once, confirms the turn and records it in the treasury', async () => {
    const { prisma, service } = setup();
    await service.markDeposit('co1', 'c1', 'b1', { method: 'cash' });
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: { in: ['REQUESTED', 'PENDING_PAYMENT', 'CONFIRMED'] }, depositPaidAt: null },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        depositMethod: 'cash',
        depositAmount: 12000,
        paidAmount: { increment: 12000 },
      }),
    });
    expect(prisma.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'income',
        category: 'Alquiler de canchas',
        amount: 12000,
        reference: 'turno-sena:b1',
        description: 'Seña (efectivo) · Cancha 1 · 20/10 21:00 · Juan',
      }),
    });

    prisma.booking.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.markDeposit('co1', 'c1', 'b1', { method: 'transfer' })).rejects.toThrow(/cambió/);
  });

  it('charges the rest of the turn and marks that they came', async () => {
    const { prisma, service } = setup();
    prisma.booking.findFirst.mockResolvedValue({ ...(await prisma.booking.findFirst()), status: 'CONFIRMED' });
    await service.registerPayment('co1', 'c1', 'b1', { method: 'transfer', amount: 12000 });
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { paidAmount: { increment: 12000 }, paymentMethod: 'transfer', attendance: 'SHOWED' },
    });
    expect(prisma.financialTransaction.create.mock.calls[0][0].data.reference).toMatch(/^turno-pago:b1:/);
  });

  it('explains which turn blocks a manual booking', async () => {
    const { prisma, service } = setup();
    prisma.booking.create.mockRejectedValue(new Error('conflicting key value violates exclusion constraint "Booking_no_overlap"'));
    prisma.booking.findMany.mockResolvedValue([{ startMinute: 1260, durationMinutes: 90, contactName: 'Los Pibes' }]);
    await expect(
      service.createBooking('uid', 'co1', 'c1', {
        facilityId: 'f1',
        date: '2026-10-20',
        startMinute: 1290,
        durationMinutes: 60,
        clientName: 'Mario',
      }),
    ).rejects.toThrow('Se pisa con el turno de Los Pibes (21:00 a 22:30).');
  });

  it('does not allow two fixed turns that overlap on the same court and day', async () => {
    const { prisma, service } = setup();
    prisma.recurringBooking.findMany.mockResolvedValueOnce([
      { clientName: 'Los Pibes', startMinute: 1260, durationMinutes: 60, endDate: null },
    ]);
    await expect(
      service.createRecurring('uid', 'co1', 'c1', {
        facilityId: 'f1',
        weekday: 2,
        startMinute: 1290,
        durationMinutes: 90,
        clientName: 'Otro',
      }),
    ).rejects.toThrow(/Se pisa con el turno fijo de Los Pibes/);
    expect(prisma.recurringBooking.create).not.toHaveBeenCalled();
  });

  it('ending a fixed turn only removes untouched future turns', async () => {
    const { prisma, service } = setup();
    prisma.recurringBooking.findFirst.mockResolvedValue({ id: 'fx1', startDate: '2026-01-01' });
    await service.endRecurring('co1', 'c1', 'fx1', '2026-10-27');
    expect(prisma.recurringBooking.update).toHaveBeenCalledWith({ where: { id: 'fx1' }, data: { endDate: '2026-10-26' } });
    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({
      where: { recurringId: 'fx1', date: { gte: '2026-10-27' }, paidAmount: 0, attendance: null, depositPaidAt: null },
    });
  });

  it('computes the occupancy of the night window per court', async () => {
    const { prisma, service } = setup();
    prisma.booking.findMany.mockResolvedValue([
      { facilityId: 'f1', startMinute: 1200, durationMinutes: 60, attendance: null },
      { facilityId: 'f1', startMinute: 1050, durationMinutes: 60, attendance: 'NO_SHOW' },
    ]);
    const result = await service.occupancy('co1', 'c1', '2026-09');
    // Septiembre: 30 noches de 18 a 24 = 10.800 min; ocupados 60 + 30 (la mitad que cae en la franja).
    expect(result.facilities[0]).toMatchObject({ available: 10800, occupied: 90, percent: 0.8 });
    expect(result.total.noShows).toBe(1);
    expect(result.previous.month).toBe('2026-08');
  });

  it('lists the dates of a fixed turn inside its validity', () => {
    expect(occurrenceDates({ weekday: 2, startDate: '2026-10-14', endDate: '2026-10-27' }, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-20',
      '2026-10-27',
    ]);
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});
