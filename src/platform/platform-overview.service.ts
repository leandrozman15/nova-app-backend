import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 60 * 60 * 1000;
const MONTHS_OF_SIGNUPS = 6;

type Counter = Map<string, number>;

function counter<T extends { clubId: string }>(
  rows: T[],
  value: (row: T) => number,
): Counter {
  const map: Counter = new Map();
  for (const row of rows)
    map.set(row.clubId, (map.get(row.clubId) ?? 0) + value(row));
  return map;
}

/** "2026-10" para los últimos N meses, del más viejo al actual. */
export function lastMonths(count: number, now = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - (count - 1 - index),
        1,
      ),
    );
    return date.toISOString().slice(0, 7);
  });
}

/**
 * Panorama de toda la plataforma para el dueño de Fluxion: clubes de todas las
 * empresas, usuarios de la app, actividad y facturación. Solo lectura.
 */
@Injectable()
export class PlatformOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY);
    const months = lastMonths(MONTHS_OF_SIGNUPS);
    const signupsSince = new Date(`${months[0]}-01T00:00:00Z`);

    const [
      clubs,
      memberships,
      membershipUsers,
      bookingUsers,
      entryUsers,
      inquiryUsers,
      bookings30,
      lastBookings,
      pendingRequests,
      tournaments,
      newInquiries,
      charges,
      players,
      members,
      admins,
      freeUsers,
      freeUsers30,
      freeSignups,
    ] = await Promise.all([
      this.prisma.club.findMany({
        select: {
          id: true,
          name: true,
          city: true,
          logoUrl: true,
          status: true,
          isPublic: true,
          bookingMode: true,
          municipalityName: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.clubMembership.groupBy({
        by: ['clubId', 'status'],
        _count: { _all: true },
      }),
      // Usuarios de la app vinculados a cada club (sin empresa = usuario libre).
      this.prisma.clubMembership.findMany({
        where: { user: { companyId: null } },
        select: { clubId: true, userId: true },
        distinct: ['clubId', 'userId'],
      }),
      this.prisma.booking.findMany({
        select: { clubId: true, userId: true },
        distinct: ['clubId', 'userId'],
      }),
      this.prisma.tournamentEntry.findMany({
        select: { clubId: true, userId: true },
        distinct: ['clubId', 'userId'],
      }),
      this.prisma.activityInquiry.findMany({
        select: { clubId: true, userId: true },
        distinct: ['clubId', 'userId'],
      }),
      this.prisma.booking.groupBy({
        by: ['clubId'],
        where: {
          createdAt: { gte: since30 },
          status: { in: ['CONFIRMED', 'REQUESTED', 'PENDING_PAYMENT'] },
        },
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ['clubId'],
        _max: { createdAt: true },
      }),
      this.prisma.booking.groupBy({
        by: ['clubId'],
        where: { status: 'REQUESTED' },
        _count: { _all: true },
      }),
      this.prisma.clubTournament.groupBy({
        by: ['clubId', 'status'],
        _count: { _all: true },
      }),
      this.prisma.activityInquiry.groupBy({
        by: ['clubId'],
        where: { status: 'NEW' },
        _count: { _all: true },
      }),
      this.prisma.platformCharge.groupBy({
        by: ['clubId', 'status'],
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.player.groupBy({ by: ['clubId'], _count: { _all: true } }),
      this.prisma.member.groupBy({ by: ['clubId'], _count: { _all: true } }),
      this.prisma.clubMembership.findMany({
        where: { status: 'ACTIVA', role: 'club_admin' },
        select: { clubId: true, user: { select: { email: true } } },
      }),
      this.prisma.user.count({ where: { companyId: null } }),
      this.prisma.user.count({
        where: { companyId: null, createdAt: { gte: since30 } },
      }),
      this.prisma.user.findMany({
        where: { companyId: null, createdAt: { gte: signupsSince } },
        select: { createdAt: true },
      }),
    ]);

    // Usuarios únicos de la app por club (membresía, reserva, torneo o consulta).
    const appUsers = new Map<string, Set<string>>();
    for (const row of [
      ...membershipUsers,
      ...bookingUsers,
      ...entryUsers,
      ...inquiryUsers,
    ]) {
      const set = appUsers.get(row.clubId) ?? new Set<string>();
      set.add(row.userId);
      appUsers.set(row.clubId, set);
    }

    const membershipBy = (status: string) =>
      counter(
        memberships.filter((row) => row.status === status),
        (row) => row._count._all,
      );
    const activeMembers = membershipBy('ACTIVA');
    const requested = membershipBy('SOLICITADA');
    const bookings30By = counter(bookings30, (row) => row._count._all);
    const pendingBookingsBy = counter(
      pendingRequests,
      (row) => row._count._all,
    );
    const inquiriesBy = counter(newInquiries, (row) => row._count._all);
    const playersBy = counter(players, (row) => row._count._all);
    const membersBy = counter(members, (row) => row._count._all);
    const publishedTournaments = counter(
      tournaments.filter(
        (row) => row.status === 'PUBLISHED' || row.status === 'CLOSED',
      ),
      (row) => row._count._all,
    );
    const allTournaments = counter(tournaments, (row) => row._count._all);
    const chargeSum = (status: string) =>
      counter(
        charges.filter((row) => row.status === status),
        (row) => Number(row._sum.amount ?? 0),
      );
    const pendingCharges = chargeSum('PENDING');
    const paidCharges = chargeSum('PAID');
    const lastBookingBy = new Map(
      lastBookings.map((row) => [row.clubId, row._max.createdAt]),
    );
    const adminsBy = new Map<string, string[]>();
    for (const admin of admins) {
      adminsBy.set(admin.clubId, [
        ...(adminsBy.get(admin.clubId) ?? []),
        admin.user.email,
      ]);
    }

    const rows = clubs.map((club) => ({
      id: club.id,
      name: club.name,
      city: club.city,
      logoUrl: club.logoUrl,
      status: club.status,
      municipality: club.municipalityName,
      company: club.company,
      isPublic: club.isPublic,
      bookingMode: club.bookingMode,
      createdAt: club.createdAt,
      adminEmails: adminsBy.get(club.id) ?? [],
      appUsers: appUsers.get(club.id)?.size ?? 0,
      linkedMembers: activeMembers.get(club.id) ?? 0,
      pendingJoinRequests: requested.get(club.id) ?? 0,
      players: playersBy.get(club.id) ?? 0,
      members: membersBy.get(club.id) ?? 0,
      bookingsLast30: bookings30By.get(club.id) ?? 0,
      pendingBookingRequests: pendingBookingsBy.get(club.id) ?? 0,
      lastBookingAt: lastBookingBy.get(club.id) ?? null,
      tournamentsPublished: publishedTournaments.get(club.id) ?? 0,
      tournamentsTotal: allTournaments.get(club.id) ?? 0,
      newInquiries: inquiriesBy.get(club.id) ?? 0,
      chargesPending: pendingCharges.get(club.id) ?? 0,
      chargesPaid: paidCharges.get(club.id) ?? 0,
    }));

    const signupsByMonth = new Map(months.map((month) => [month, 0]));
    for (const user of freeSignups) {
      const month = user.createdAt.toISOString().slice(0, 7);
      if (signupsByMonth.has(month))
        signupsByMonth.set(month, (signupsByMonth.get(month) ?? 0) + 1);
    }

    const sum = (pick: (row: (typeof rows)[number]) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);

    return {
      generatedAt: new Date(now),
      totals: {
        clubs: rows.length,
        publicClubs: rows.filter((row) => row.isPublic).length,
        clubsWithOnlineBookings: rows.filter((row) => row.bookingMode !== 'off')
          .length,
        appUsers: freeUsers,
        appUsersLast30: freeUsers30,
        linkedMembers: sum((row) => row.linkedMembers),
        pendingJoinRequests: sum((row) => row.pendingJoinRequests),
        bookingsLast30: sum((row) => row.bookingsLast30),
        tournamentsPublished: sum((row) => row.tournamentsPublished),
        chargesPending: sum((row) => row.chargesPending),
        chargesPaid: sum((row) => row.chargesPaid),
      },
      signupsByMonth: [...signupsByMonth.entries()].map(([month, count]) => ({
        month,
        count,
      })),
      clubs: rows,
    };
  }
}
