import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';

import { todayIn } from '../bookings/booking-time';
import { ensureOccurrences } from '../bookings/fixed-turns';
import { normalizeWhatsapp } from '../clubs/whatsapp';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { dueForPush, pushReminder, REMIND_BEFORE_MS, whatsappReminder } from './reminder-rules';

/** Turnos que cuentan: confirmados o pedidos al club (no las reservas que esperan el pago online). */
const REMINDABLE: BookingStatus[] = ['CONFIRMED', 'REQUESTED'];
const MAX_PUSH_PER_RUN = 300;

@Injectable()
export class BookingRemindersService {
  private readonly logger = new Logger(BookingRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** Turnos de alquiler del día con el mensaje de WhatsApp ya armado (cola de la consola). */
  async listForDay(companyId: string, clubId: string, date?: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { name: true, timezone: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    const today = todayIn(club.timezone);
    const day = date ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException('Fecha inválida');
    await ensureOccurrences(this.prisma, clubId, day, day);
    const bookings = await this.prisma.booking.findMany({
      where: { clubId, date: day, kind: 'ALQUILER', status: { in: REMINDABLE } },
      orderBy: [{ startMinute: 'asc' }],
      select: {
        id: true,
        date: true,
        startMinute: true,
        durationMinutes: true,
        startsAt: true,
        contactName: true,
        contactPhone: true,
        source: true,
        whatsappRemindedAt: true,
        reminderPushAt: true,
        facility: { select: { name: true } },
        user: { select: { name: true, phone: true } },
      },
    });
    const now = Date.now();
    return {
      date: day,
      today,
      items: bookings.map((b) => {
        const name = b.contactName || b.user?.name || null;
        const phone = b.contactPhone || b.user?.phone || null;
        const startsIn = b.startsAt.getTime() - now;
        return {
          id: b.id,
          facilityName: b.facility.name,
          startMinute: b.startMinute,
          durationMinutes: b.durationMinutes,
          startsAt: b.startsAt,
          name,
          phone,
          whatsapp: normalizeWhatsapp(phone),
          source: b.source,
          past: startsIn < 0,
          /** Empieza dentro de las próximas 3 horas: es el momento de avisar. */
          soon: startsIn >= 0 && startsIn <= REMIND_BEFORE_MS,
          whatsappRemindedAt: b.whatsappRemindedAt,
          pushRemindedAt: b.reminderPushAt,
          message: whatsappReminder({
            clubName: club.name,
            facilityName: b.facility.name,
            date: b.date,
            today,
            startMinute: b.startMinute,
            durationMinutes: b.durationMinutes,
            contactName: name,
          }),
        };
      }),
    };
  }

  async markWhatsapp(companyId: string, clubId: string, bookingId: string) {
    const res = await this.prisma.booking.updateMany({
      where: { id: bookingId, clubId, companyId },
      data: { whatsappRemindedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Turno no encontrado');
    return { ok: true };
  }

  /**
   * Corrida frecuente (cron cada 15 minutos): push al que reservó desde la app
   * cuando faltan 3 horas o menos para su turno. Una sola vez por turno.
   */
  async runPush(now = new Date()) {
    const until = new Date(now.getTime() + REMIND_BEFORE_MS);
    const bookings = await this.prisma.booking.findMany({
      where: {
        userId: { not: null },
        kind: 'ALQUILER',
        status: { in: REMINDABLE },
        reminderPushAt: null,
        startsAt: { gt: now, lte: until },
      },
      orderBy: { startsAt: 'asc' },
      take: MAX_PUSH_PER_RUN,
      select: {
        id: true,
        clubId: true,
        date: true,
        startMinute: true,
        durationMinutes: true,
        startsAt: true,
        facility: { select: { name: true } },
        club: { select: { name: true, timezone: true } },
        user: { select: { firebaseUid: true } },
      },
    });
    let sent = 0;
    let skipped = 0;
    for (const b of bookings) {
      // Se marca igual aunque no tenga dispositivos: así no se reintenta cada 15 minutos.
      await this.prisma.booking.update({ where: { id: b.id }, data: { reminderPushAt: now } });
      if (!dueForPush(b.startsAt, now) || !b.user?.firebaseUid) {
        skipped++;
        continue;
      }
      const msg = pushReminder({
        clubName: b.club.name,
        facilityName: b.facility.name,
        date: b.date,
        today: todayIn(b.club.timezone, now),
        startMinute: b.startMinute,
        durationMinutes: b.durationMinutes,
      });
      try {
        const res = await this.push.notifyUsers([b.user.firebaseUid], {
          ...msg,
          url: '/explorar/reservas',
          tag: `turno-${b.id}`,
        });
        if (res.sent > 0) sent++;
        else skipped++;
      } catch (e) {
        skipped++;
        this.logger.warn(`Recordatorio turno ${b.id}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }
    return { checked: bookings.length, sent, skipped };
  }
}
