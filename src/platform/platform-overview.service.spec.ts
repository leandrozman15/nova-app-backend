import { Prisma } from '@prisma/client';

import {
  lastMonths,
  PlatformOverviewService,
} from './platform-overview.service';

describe('PlatformOverviewService', () => {
  it('lists the last months oldest first', () => {
    expect(lastMonths(3, new Date('2026-01-15T12:00:00Z'))).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });

  it('aggregates app users, activity and billing per club', async () => {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const prisma: any = {
      club: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a',
            name: 'Club A',
            city: 'Curitiba',
            logoUrl: null,
            status: 'active',
            isPublic: true,
            bookingMode: 'request',
            municipalityName: 'San Miguel',
            createdAt: now,
            company: { id: 'co', name: 'Co' },
            subscription: {
              status: 'ACTIVE',
              customPrice: null,
              plan: { name: 'Club', monthlyPrice: new Prisma.Decimal(50000) },
            },
          },
          {
            id: 'b',
            name: 'Club B',
            city: null,
            logoUrl: null,
            status: 'active',
            isPublic: false,
            bookingMode: 'off',
            municipalityName: null,
            createdAt: now,
            company: { id: 'co2', name: 'Co2' },
          },
        ]),
      },
      clubMembership: {
        groupBy: jest.fn().mockResolvedValue([
          { clubId: 'a', status: 'ACTIVA', _count: { _all: 3 } },
          { clubId: 'a', status: 'SOLICITADA', _count: { _all: 2 } },
        ]),
        findMany: jest
          .fn()
          // usuarios libres vinculados
          .mockResolvedValueOnce([
            { clubId: 'a', userId: 'u1' },
            { clubId: 'a', userId: 'u2' },
          ])
          // admins del club
          .mockResolvedValueOnce([
            { clubId: 'a', user: { email: 'admin@a.com' } },
          ]),
      },
      booking: {
        // u2 reservó (ya contado) y u3 también: 3 usuarios únicos en A.
        findMany: jest.fn().mockResolvedValue([
          { clubId: 'a', userId: 'u2' },
          { clubId: 'a', userId: 'u3' },
        ]),
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ clubId: 'a', _count: { _all: 7 } }])
          .mockResolvedValueOnce([{ clubId: 'a', _max: { createdAt: now } }])
          .mockResolvedValueOnce([{ clubId: 'a', _count: { _all: 1 } }]),
      },
      tournamentEntry: {
        findMany: jest.fn().mockResolvedValue([{ clubId: 'b', userId: 'u9' }]),
      },
      activityInquiry: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ clubId: 'a', _count: { _all: 4 } }]),
      },
      clubTournament: {
        groupBy: jest.fn().mockResolvedValue([
          { clubId: 'b', status: 'PUBLISHED', _count: { _all: 1 } },
          { clubId: 'b', status: 'DRAFT', _count: { _all: 2 } },
        ]),
      },
      platformCharge: {
        groupBy: jest.fn().mockResolvedValue([
          {
            clubId: 'b',
            status: 'PENDING',
            _sum: { amount: new Prisma.Decimal(15000) },
            _count: { _all: 1 },
          },
          {
            clubId: 'b',
            status: 'PAID',
            _sum: { amount: new Prisma.Decimal(5000) },
            _count: { _all: 1 },
          },
        ]),
      },
      player: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ clubId: 'a', _count: { _all: 40 } }]),
      },
      member: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ clubId: 'a', _count: { _all: 120 } }]),
      },
      subscriptionInvoice: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            {
              clubId: 'a',
              _count: { _all: 2 },
              _sum: { amount: new Prisma.Decimal(100000) },
            },
          ]),
      },
      user: {
        count: jest.fn().mockResolvedValueOnce(25).mockResolvedValueOnce(6),
        findMany: jest
          .fn()
          .mockResolvedValue([{ createdAt: now }, { createdAt: now }]),
      },
    };

    const result = await new PlatformOverviewService(prisma).overview();

    const a = result.clubs.find((club) => club.id === 'a')!;
    expect(a).toEqual(
      expect.objectContaining({
        appUsers: 3,
        linkedMembers: 3,
        pendingJoinRequests: 2,
        players: 40,
        members: 120,
        bookingsLast30: 7,
        pendingBookingRequests: 1,
        newInquiries: 4,
        adminEmails: ['admin@a.com'],
        subscriptionStatus: 'ACTIVE',
        monthlyPrice: 50000,
        overdueInvoices: 2,
        overdueAmount: 100000,
      }),
    );
    expect(
      result.clubs.find((club) => club.id === 'b')!.subscriptionStatus,
    ).toBeNull();
    const b = result.clubs.find((club) => club.id === 'b')!;
    expect(b).toEqual(
      expect.objectContaining({
        appUsers: 1,
        tournamentsPublished: 1,
        tournamentsTotal: 3,
        chargesPending: 15000,
        chargesPaid: 5000,
      }),
    );
    expect(result.totals).toEqual(
      expect.objectContaining({
        clubs: 2,
        publicClubs: 1,
        clubsWithOnlineBookings: 1,
        appUsers: 25,
        appUsersLast30: 6,
        chargesPending: 15000,
        mrr: 50000,
        activeSubscriptions: 1,
        suspendedClubs: 0,
        overdueAmount: 100000,
      }),
    );
    expect(result.signupsByMonth).toHaveLength(6);
    expect(result.signupsByMonth[5]).toEqual({ month: thisMonth, count: 2 });
  });
});
