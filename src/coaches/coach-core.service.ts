import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';

import {
  addDays,
  minuteLabel,
  nowMinuteIn,
  roundMoney,
  todayIn,
  weekdayOf,
  zonedMinuteToUtc,
} from '../bookings/booking-time';
import { ensureOccurrences, isOverlapError } from '../bookings/fixed-turns';
import { displayWhatsapp } from '../clubs/whatsapp';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import {
  freeSlotsForDay,
  type AvailabilityWindow,
  type FreeSlot,
  type Interval,
} from './coach-rules';

const COURT_ACTIVE: BookingStatus[] = [
  'REQUESTED',
  'PENDING_PAYMENT',
  'CONFIRMED',
];
export const LESSON_ACTIVE = ['REQUESTED', 'CONFIRMED'];
export const FORMAT_LABEL: Record<string, string> = {
  INDIVIDUAL: 'individual',
  DUO: 'dúo',
  GROUP: 'grupal',
};

export type CoachRow = {
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  timezone: string;
  whatsapp: string | null;
  status: string;
};

/** Lo que comparten el portal del profe, la app del alumno y la vidriera. */
@Injectable()
export class CoachCoreService {
  private readonly logger = new Logger(CoachCoreService.name);

  constructor(
    readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** Perfil del profe que está usando la app. */
  async coachOf(firebaseUid: string): Promise<CoachRow> {
    const coach = await this.prisma.coachProfile.findFirst({
      where: { user: { firebaseUid } },
      select: {
        id: true,
        userId: true,
        slug: true,
        displayName: true,
        timezone: true,
        whatsapp: true,
        status: true,
      },
    });
    if (!coach)
      throw new NotFoundException('Todavía no creaste tu perfil de profe.');
    if (coach.status !== 'ACTIVE')
      throw new ForbiddenException(
        'Tu perfil de profe está suspendido. Escribinos a soporte.',
      );
    return coach;
  }

  async userOf(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!user)
      throw new NotFoundException(
        'Completá tu registro en la app para seguir.',
      );
    return user;
  }

  /** Minutos ocupados de un día (clases activas y bloqueos), en la zona del profe. */
  async busyFor(
    coachId: string,
    date: string,
    timeZone: string,
    exceptLessonId?: string,
  ): Promise<Interval[]> {
    const dayStart = zonedMinuteToUtc(date, 0, timeZone);
    const dayEnd = zonedMinuteToUtc(date, 1440, timeZone);
    const [lessons, blocks] = await Promise.all([
      this.prisma.coachLesson.findMany({
        where: {
          coachId,
          date,
          status: { in: LESSON_ACTIVE },
          ...(exceptLessonId ? { id: { not: exceptLessonId } } : {}),
        },
        select: { startMinute: true, durationMinutes: true },
      }),
      this.prisma.coachBlock.findMany({
        where: { coachId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
        select: { startsAt: true, endsAt: true },
      }),
    ]);
    const toMinute = (d: Date) =>
      Math.round((d.getTime() - dayStart.getTime()) / 60_000);
    return [
      ...lessons.map((l) => ({
        start: l.startMinute,
        end: l.startMinute + l.durationMinutes,
      })),
      ...blocks.map((b) => ({
        start: Math.max(0, toMinute(b.startsAt)),
        end: Math.min(1440, toMinute(b.endsAt)),
      })),
    ];
  }

  /** Canchas ocupadas de un día (turnos del club, incluidos los fijos). */
  async courtBusyFor(
    windows: AvailabilityWindow[],
    date: string,
    exceptBookingId?: string | null,
  ) {
    const facilityIds = [
      ...new Set(
        windows.map((w) => w.facilityId).filter((x): x is string => Boolean(x)),
      ),
    ];
    if (!facilityIds.length) return {};
    const clubIds = [
      ...new Set(
        windows.map((w) => w.clubId).filter((x): x is string => Boolean(x)),
      ),
    ];
    for (const clubId of clubIds)
      await ensureOccurrences(this.prisma, clubId, date, date);
    const rows = await this.prisma.booking.findMany({
      where: {
        facilityId: { in: facilityIds },
        date,
        status: { in: COURT_ACTIVE },
        ...(exceptBookingId ? { id: { not: exceptBookingId } } : {}),
      },
      select: { facilityId: true, startMinute: true, durationMinutes: true },
    });
    const out: Record<string, Interval[]> = {};
    for (const r of rows)
      (out[r.facilityId] ||= []).push({
        start: r.startMinute,
        end: r.startMinute + r.durationMinutes,
      });
    return out;
  }

  /** Franjas del profe, solo con clubes vinculados y activos. */
  async windowsOf(coachId: string): Promise<AvailabilityWindow[]> {
    const [rows, links] = await Promise.all([
      this.prisma.coachAvailability.findMany({ where: { coachId } }),
      this.prisma.coachClubLink.findMany({
        where: { coachId, status: 'ACTIVE' },
        select: { clubId: true },
      }),
    ]);
    const active = new Set(links.map((l) => l.clubId));
    return rows.map((r) =>
      r.clubId && !active.has(r.clubId)
        ? { ...r, clubId: null, facilityId: null }
        : r,
    );
  }

  /** Horarios libres de los próximos días para una duración. */
  async slots(
    coach: Pick<CoachRow, 'id' | 'timezone'>,
    duration: number,
    from: string,
    days: number,
  ) {
    const windows = await this.windowsOf(coach.id);
    const today = todayIn(coach.timezone);
    const start = from < today ? today : from;
    const out: { date: string; slots: FreeSlot[] }[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      const weekday = weekdayOf(date);
      const dayWindows = windows.filter((w) => w.weekday === weekday);
      if (!dayWindows.length) {
        out.push({ date, slots: [] });
        continue;
      }
      const [busy, courtBusy] = await Promise.all([
        this.busyFor(coach.id, date, coach.timezone),
        this.courtBusyFor(dayWindows, date),
      ]);
      out.push({
        date,
        slots: freeSlotsForDay({
          weekday,
          windows: dayWindows,
          duration,
          busy,
          courtBusy,
          nowMinute: date === today ? nowMinuteIn(coach.timezone) : null,
        }),
      });
    }
    return out;
  }

  /**
   * Reserva la cancha del club para la clase (aparece en la agenda de alquileres como "Clase").
   * Solo si la clase tiene club y cancha y el profe está vinculado a ese club.
   */
  async reserveCourt(
    lesson: {
      id: string;
      clubId: string | null;
      facilityId: string | null;
      date: string;
      startMinute: number;
      durationMinutes: number;
      format: string;
    },
    coach: Pick<CoachRow, 'id' | 'displayName' | 'whatsapp'>,
    uid: string,
  ) {
    if (!lesson.clubId || !lesson.facilityId) return null;
    const link = await this.prisma.coachClubLink.findFirst({
      where: { clubId: lesson.clubId, coachId: coach.id, status: 'ACTIVE' },
      select: { id: true },
    });
    const club = await this.prisma.club.findUnique({
      where: { id: lesson.clubId },
      select: { id: true, companyId: true, timezone: true },
    });
    const facility = await this.prisma.facility.findFirst({
      where: { id: lesson.facilityId, clubId: lesson.clubId },
      select: { id: true, hourlyPrice: true, name: true },
    });
    if (!link || !club || !facility) return null;
    const startsAt = zonedMinuteToUtc(
      lesson.date,
      lesson.startMinute,
      club.timezone,
    );
    try {
      const booking = await this.prisma.booking.create({
        data: {
          companyId: club.companyId,
          clubId: club.id,
          facilityId: facility.id,
          date: lesson.date,
          hour: Math.floor(lesson.startMinute / 60),
          startMinute: lesson.startMinute,
          durationMinutes: lesson.durationMinutes,
          startsAt,
          endsAt: zonedMinuteToUtc(
            lesson.date,
            lesson.startMinute + lesson.durationMinutes,
            club.timezone,
          ),
          status: 'CONFIRMED',
          source: 'COACH',
          kind: 'CLASE',
          price:
            facility.hourlyPrice === null
              ? 0
              : roundMoney(
                  (Number(facility.hourlyPrice) * lesson.durationMinutes) / 60,
                ),
          depositAmount: 0,
          holdExpiresAt: startsAt,
          contactName: `Clase · ${coach.displayName}`,
          contactPhone: displayWhatsapp(coach.whatsapp),
          notes: `Clase ${FORMAT_LABEL[lesson.format] ?? ''} de ${coach.displayName} (reservada desde Fluxion).`,
          createdByUid: uid,
        },
        select: { id: true },
      });
      return booking.id;
    } catch (error) {
      if (isOverlapError(error))
        throw new ConflictException(
          `La cancha ${facility.name} ya está ocupada el ${lesson.date.split('-').reverse().slice(0, 2).join('/')} a las ${minuteLabel(lesson.startMinute)}. Elegí otro horario o cancha.`,
        );
      throw error;
    }
  }

  /** Libera la cancha reservada para la clase. */
  async releaseCourt(bookingId: string | null | undefined, reason: string) {
    if (!bookingId) return;
    await this.prisma.booking.updateMany({
      where: { id: bookingId, status: { in: COURT_ACTIVE } },
      data: {
        status: 'CANCELLED_BY_USER',
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    });
  }

  /** Push a usuarios (profe o alumnos); nunca corta el flujo si falla. */
  async notify(
    userIds: (string | null | undefined)[],
    msg: { title: string; body: string; url: string; tag: string },
  ) {
    const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
    if (!ids.length) return;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { firebaseUid: true },
      });
      await this.push.notifyUsers(
        users.map((u) => u.firebaseUid),
        msg,
      );
    } catch (e) {
      this.logger.warn(
        `Aviso de profes: ${e instanceof Error ? e.message : 'error'}`,
      );
    }
  }
}
