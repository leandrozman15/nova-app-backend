import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import { addDays, todayIn, weekdayOf, zonedMinuteToUtc } from './booking-time';

/** Error de la restricción que impide dos turnos activos pisados en la misma cancha. */
export function isOverlapError(error: unknown) {
  const text = String((error as { message?: string })?.message ?? '');
  return (
    text.includes('Booking_no_overlap') ||
    text.includes('23P01') ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002')
  );
}

/** Los turnos fijos se generan hasta 8 semanas adelante. */
export const FIXED_HORIZON_DAYS = 56;

/** Fechas (YYYY-MM-DD) entre from y to inclusive. */
export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Fechas en que corresponde un turno fijo dentro de un rango. */
export function occurrenceDates(
  rule: { weekday: number; startDate: string; endDate: string | null },
  from: string,
  to: string,
) {
  return datesBetween(from, to).filter(
    (date) =>
      weekdayOf(date) === rule.weekday &&
      date >= rule.startDate &&
      (!rule.endDate || date <= rule.endDate),
  );
}

/** Las columnas son timestamp sin zona en UTC (como las guarda Prisma). */
export const utcText = (value: Date) =>
  value.toISOString().replace('T', ' ').replace('Z', '');

/**
 * Crea (si faltan) los turnos de los fijos en el rango. Idempotente: un turno
 * por fijo y fecha; si el horario ya está tomado por otra reserva, no se crea.
 */
export async function ensureOccurrences(
  prisma: PrismaService | Prisma.TransactionClient,
  clubId: string,
  from: string,
  to: string,
) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { companyId: true, timezone: true },
  });
  if (!club) return 0;
  const limit = addDays(todayIn(club.timezone), FIXED_HORIZON_DAYS);
  const until = to < limit ? to : limit;
  if (from > until) return 0;
  const rules = await prisma.recurringBooking.findMany({
    where: {
      clubId,
      startDate: { lte: until },
      OR: [{ endDate: null }, { endDate: { gte: from } }],
    },
  });
  const rows: Prisma.Sql[] = [];
  for (const rule of rules) {
    for (const date of occurrenceDates(rule, from, until)) {
      const startsAt = zonedMinuteToUtc(date, rule.startMinute, club.timezone);
      const endsAt = zonedMinuteToUtc(
        date,
        rule.startMinute + rule.durationMinutes,
        club.timezone,
      );
      rows.push(
        Prisma.sql`(${randomUUID()}, ${rule.companyId}, ${rule.clubId}, ${rule.facilityId}, ${date}, ${Math.floor(rule.startMinute / 60)}, ${rule.startMinute}, ${rule.durationMinutes}, ${utcText(startsAt)}::timestamp, ${utcText(endsAt)}::timestamp, 'CONFIRMED'::"BookingStatus", ${Number(rule.price)}, 0, ${utcText(startsAt)}::timestamp, ${rule.clientName}, ${rule.clientPhone}, 'FIXED', ${rule.kind}, ${rule.id}, ${rule.notes}, (NOW() AT TIME ZONE 'UTC'))`,
      );
    }
  }
  if (rows.length === 0) return 0;
  // ON CONFLICT DO NOTHING cubre el único (fijo, fecha) y la restricción de solapes.
  return prisma.$executeRaw`
      INSERT INTO "Booking" ("id", "companyId", "clubId", "facilityId", "date", "hour", "startMinute",
        "durationMinutes", "startsAt", "endsAt", "status", "price", "depositAmount", "holdExpiresAt",
        "contactName", "contactPhone", "source", "kind", "recurringId", "notes", "updatedAt")
      VALUES ${Prisma.join(rows)}
      ON CONFLICT DO NOTHING`;
}
