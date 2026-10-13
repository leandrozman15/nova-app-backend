import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type BookingStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  addDays,
  ALLOWED_DURATIONS,
  isIsoDate,
  minuteLabel,
  roundMoney,
  todayIn,
  weekdayOf,
  zonedMinuteToUtc,
} from './booking-time';
import { BookingsService } from './bookings.service';
import {
  datesBetween,
  ensureOccurrences,
  isOverlapError,
  FIXED_HORIZON_DAYS,
  occurrenceDates,
} from './fixed-turns';
import type {
  AgendaBookingDto,
  AgendaSettingsDto,
  AttendanceDto,
  DepositDto,
  RecurringDto,
  TurnPaymentDto,
  UpdateRecurringDto,
} from './dto/agenda.dto';

const ACTIVE: BookingStatus[] = ['REQUESTED', 'PENDING_PAYMENT', 'CONFIRMED'];
const MAX_RANGE_DAYS = 42;

export const KIND_LABELS: Record<string, string> = {
  ALQUILER: 'Alquiler',
  ENTRENAMIENTO: 'Entrenamiento',
  PARTIDO: 'Partido',
  MANTENIMIENTO: 'Mantenimiento',
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'efectivo',
  transfer: 'transferencia',
  other: 'otro medio',
};

const AGENDA_SELECT = {
  id: true,
  facilityId: true,
  date: true,
  startMinute: true,
  durationMinutes: true,
  status: true,
  source: true,
  kind: true,
  price: true,
  depositAmount: true,
  paidAmount: true,
  depositPaidAt: true,
  depositMethod: true,
  paymentMethod: true,
  attendance: true,
  contactName: true,
  contactPhone: true,
  notes: true,
  holdExpiresAt: true,
  recurringId: true,
  mpPaymentId: true,
  mpPreferenceId: true,
  createdAt: true,
  user: { select: { name: true, email: true, phone: true } },
} satisfies Prisma.BookingSelect;

type AgendaRow = Prisma.BookingGetPayload<{ select: typeof AGENDA_SELECT }>;

const presentBooking = (row: AgendaRow) => ({
  ...row,
  price: Number(row.price),
  depositAmount: Number(row.depositAmount),
  paidAmount: Number(row.paidAmount),
  endMinute: row.startMinute + row.durationMinutes,
  label: `${minuteLabel(row.startMinute)} a ${minuteLabel(row.startMinute + row.durationMinutes)}`,
});

/** Agenda de canchas del club: turnos de la app, manuales y fijos en un solo lugar. */
@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  /** Crea (si faltan) los turnos de los fijos en el rango (ver fixed-turns.ts). */
  ensureOccurrences(clubId: string, from: string, to: string) {
    return ensureOccurrences(this.prisma, clubId, from, to);
  }

  async agenda(companyId: string, clubId: string, from?: string, to?: string) {
    const club = await this.requireClub(companyId, clubId);
    const start = from && isIsoDate(from) ? from : todayIn(club.timezone);
    let end = to && isIsoDate(to) ? to : start;
    if (end < start) end = start;
    if (datesBetween(start, end).length > MAX_RANGE_DAYS)
      end = addDays(start, MAX_RANGE_DAYS - 1);

    await this.bookings.expireStaleHolds({ clubId });
    await this.ensureOccurrences(clubId, start, end);
    const [facilities, rows] = await Promise.all([
      this.prisma.facility.findMany({
        where: { clubId, companyId },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          type: true,
          typeLabel: true,
          sport: true,
          bookable: true,
          hourlyPrice: true,
          slotDurations: true,
        },
      }),
      this.prisma.booking.findMany({
        where: {
          clubId,
          companyId,
          date: { gte: start, lte: end },
          status: { in: ACTIVE },
        },
        orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
        select: AGENDA_SELECT,
      }),
    ]);
    return {
      from: start,
      to: end,
      today: todayIn(club.timezone),
      club: {
        timezone: club.timezone,
        openMinute: club.openMinute,
        closeMinute: club.closeMinute,
        bookingMode: club.bookingMode,
        requireDeposit: club.requireDeposit,
        depositPercent: club.depositPercent,
        depositAlias: club.depositAlias,
        depositHoldHours: club.depositHoldHours,
      },
      facilities: facilities.map((facility) => ({
        ...facility,
        hourlyPrice:
          facility.hourlyPrice === null ? null : Number(facility.hourlyPrice),
      })),
      bookings: rows.map(presentBooking),
    };
  }

  // ─── Turnos manuales ──────────────────────────────────────────────────────

  async createBooking(
    uid: string,
    companyId: string,
    clubId: string,
    dto: AgendaBookingDto,
  ) {
    const club = await this.requireClub(companyId, clubId);
    const facility = await this.requireFacility(clubId, dto.facilityId);
    this.validateTime(dto.startMinute, dto.durationMinutes);
    if (!isIsoDate(dto.date)) throw new BadRequestException('Fecha inválida.');

    const price =
      dto.price ??
      (facility.hourlyPrice === null
        ? 0
        : roundMoney(
            (Number(facility.hourlyPrice) * dto.durationMinutes) / 60,
          ));

    if (dto.repeatWeekly) {
      return this.createRecurring(uid, companyId, clubId, {
        facilityId: dto.facilityId,
        weekday: weekdayOf(dto.date),
        startMinute: dto.startMinute,
        durationMinutes: dto.durationMinutes,
        kind: dto.kind,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        price,
        notes: dto.notes,
        startDate: dto.date,
      });
    }

    await this.ensureOccurrences(clubId, dto.date, dto.date);
    const startsAt = zonedMinuteToUtc(dto.date, dto.startMinute, club.timezone);
    try {
      const row = await this.prisma.booking.create({
        data: {
          companyId,
          clubId,
          facilityId: facility.id,
          date: dto.date,
          hour: Math.floor(dto.startMinute / 60),
          startMinute: dto.startMinute,
          durationMinutes: dto.durationMinutes,
          startsAt,
          endsAt: zonedMinuteToUtc(
            dto.date,
            dto.startMinute + dto.durationMinutes,
            club.timezone,
          ),
          status: 'CONFIRMED',
          source: 'CLUB',
          kind: dto.kind ?? 'ALQUILER',
          price,
          depositAmount: 0,
          holdExpiresAt: startsAt,
          contactName: dto.clientName.trim(),
          contactPhone: dto.clientPhone?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdByUid: uid,
        },
        select: AGENDA_SELECT,
      });
      return { booking: presentBooking(row) };
    } catch (error) {
      if (isOverlapError(error))
        throw new ConflictException(
          await this.overlapMessage(
            facility.id,
            dto.date,
            dto.startMinute,
            dto.durationMinutes,
          ),
        );
      throw error;
    }
  }

  // ─── Turnos fijos ─────────────────────────────────────────────────────────

  async listRecurring(companyId: string, clubId: string) {
    const club = await this.requireClub(companyId, clubId);
    const today = todayIn(club.timezone);
    const rules = await this.prisma.recurringBooking.findMany({
      where: {
        clubId,
        companyId,
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      include: { facility: { select: { id: true, name: true } } },
    });
    return rules.map((rule) => ({
      ...rule,
      price: Number(rule.price),
      label: `${minuteLabel(rule.startMinute)} a ${minuteLabel(rule.startMinute + rule.durationMinutes)}`,
    }));
  }

  async createRecurring(
    uid: string,
    companyId: string,
    clubId: string,
    dto: RecurringDto,
  ) {
    const club = await this.requireClub(companyId, clubId);
    const facility = await this.requireFacility(clubId, dto.facilityId);
    this.validateTime(dto.startMinute, dto.durationMinutes);
    const today = todayIn(club.timezone);
    const startDate =
      dto.startDate && isIsoDate(dto.startDate) ? dto.startDate : today;
    const end = dto.startMinute + dto.durationMinutes;

    // Dos fijos no pueden pisarse en la misma cancha y día.
    const clash = (
      await this.prisma.recurringBooking.findMany({
        where: {
          facilityId: facility.id,
          weekday: dto.weekday,
          OR: [{ endDate: null }, { endDate: { gte: startDate } }],
        },
      })
    ).find(
      (rule) =>
        rule.startMinute < end &&
        dto.startMinute < rule.startMinute + rule.durationMinutes,
    );
    if (clash)
      throw new ConflictException(
        `Se pisa con el turno fijo de ${clash.clientName} (${minuteLabel(clash.startMinute)} a ${minuteLabel(clash.startMinute + clash.durationMinutes)}).`,
      );

    const rule = await this.prisma.recurringBooking.create({
      data: {
        companyId,
        clubId,
        facilityId: facility.id,
        weekday: dto.weekday,
        startMinute: dto.startMinute,
        durationMinutes: dto.durationMinutes,
        kind: dto.kind ?? 'ALQUILER',
        clientName: dto.clientName.trim(),
        clientPhone: dto.clientPhone?.trim() || null,
        price: dto.price ?? 0,
        notes: dto.notes?.trim() || null,
        startDate,
        createdByUid: uid,
      },
    });

    // Fechas de las próximas semanas que ya tienen otra reserva en ese horario.
    const horizon = addDays(today, FIXED_HORIZON_DAYS);
    const dates = occurrenceDates(rule, startDate, horizon);
    const busy = await this.prisma.booking.findMany({
      where: {
        facilityId: facility.id,
        date: { in: dates },
        status: { in: ACTIVE },
        recurringId: null,
      },
      select: {
        date: true,
        startMinute: true,
        durationMinutes: true,
        contactName: true,
      },
    });
    const conflicts = busy
      .filter(
        (row) =>
          row.startMinute < end &&
          dto.startMinute < row.startMinute + row.durationMinutes,
      )
      .map((row) => ({
        date: row.date,
        label:
          `${minuteLabel(row.startMinute)} ${row.contactName ?? ''}`.trim(),
      }));

    await this.ensureOccurrences(clubId, startDate, horizon);
    return { recurring: { ...rule, price: Number(rule.price) }, conflicts };
  }

  async updateRecurring(
    companyId: string,
    clubId: string,
    id: string,
    dto: UpdateRecurringDto,
  ) {
    const club = await this.requireClub(companyId, clubId);
    const rule = await this.requireRecurring(companyId, clubId, id);
    const data = {
      clientName: dto.clientName?.trim() || undefined,
      clientPhone:
        dto.clientPhone === undefined
          ? undefined
          : dto.clientPhone.trim() || null,
      price: dto.price,
      notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
    };
    await this.prisma.recurringBooking.update({ where: { id: rule.id }, data });
    // Los turnos que vienen (todavía sin cobrar) toman los datos nuevos.
    await this.prisma.booking.updateMany({
      where: {
        recurringId: rule.id,
        date: { gte: todayIn(club.timezone) },
        paidAmount: 0,
        attendance: null,
      },
      data: {
        contactName: data.clientName,
        contactPhone: data.clientPhone,
        price: data.price,
        notes: data.notes,
      },
    });
    return { ok: true };
  }

  /** Termina un turno fijo: desde `from` (inclusive) ya no se genera. */
  async endRecurring(
    companyId: string,
    clubId: string,
    id: string,
    from?: string,
  ) {
    const club = await this.requireClub(companyId, clubId);
    const rule = await this.requireRecurring(companyId, clubId, id);
    const today = todayIn(club.timezone);
    const since = from && isIsoDate(from) ? from : today;
    const endDate = addDays(since, -1);
    await this.prisma.recurringBooking.update({
      where: { id: rule.id },
      data: { endDate: endDate < rule.startDate ? rule.startDate : endDate },
    });
    // Se borran los turnos generados que nadie tocó; los cobrados o atendidos quedan.
    const removed = await this.prisma.booking.deleteMany({
      where: {
        recurringId: rule.id,
        date: { gte: since },
        paidAmount: 0,
        attendance: null,
        depositPaidAt: null,
      },
    });
    if (endDate < rule.startDate) {
      await this.prisma.recurringBooking
        .delete({ where: { id: rule.id } })
        .catch(() => undefined);
    }
    return { ok: true, removed: removed.count };
  }

  // ─── Acciones del encargado ───────────────────────────────────────────────

  /** Seña cobrada en el club (efectivo o transferencia): confirma el turno. */
  async markDeposit(
    companyId: string,
    clubId: string,
    id: string,
    dto: DepositDto,
  ) {
    const booking = await this.requireBooking(companyId, clubId, id);
    if (booking.depositPaidAt)
      throw new ConflictException('La seña ya estaba registrada.');
    const amount = dto.amount ?? Number(booking.depositAmount);
    if (!(amount > 0))
      throw new BadRequestException('Indicá el monto de la seña.');
    const now = new Date();
    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: { in: ACTIVE }, depositPaidAt: null },
      data: {
        status: 'CONFIRMED',
        depositPaidAt: now,
        depositMethod: dto.method,
        depositAmount: amount,
        paidAmount: { increment: amount },
      },
    });
    if (count === 0)
      throw new ConflictException('El turno cambió. Actualizá la agenda.');
    await this.toTreasury(
      booking,
      amount,
      `Seña (${METHOD_LABELS[dto.method]})`,
      `turno-sena:${id}`,
    );
    return this.getBooking(id);
  }

  async markAttendance(
    companyId: string,
    clubId: string,
    id: string,
    dto: AttendanceDto,
  ) {
    const booking = await this.requireBooking(companyId, clubId, id);
    if (booking.status !== 'CONFIRMED')
      throw new ConflictException('Primero confirmá el turno.');
    await this.prisma.booking.update({
      where: { id },
      data: { attendance: dto.attendance ?? null },
    });
    return this.getBooking(id);
  }

  /** Cobro del turno (saldo o total) en el club. Entra a Tesorería. */
  async registerPayment(
    companyId: string,
    clubId: string,
    id: string,
    dto: TurnPaymentDto,
  ) {
    const booking = await this.requireBooking(companyId, clubId, id);
    if (booking.status !== 'CONFIRMED')
      throw new ConflictException('Primero confirmá el turno.');
    await this.prisma.booking.update({
      where: { id },
      data: {
        paidAmount: { increment: dto.amount },
        paymentMethod: dto.method,
        attendance: booking.attendance ?? 'SHOWED',
      },
    });
    await this.toTreasury(
      booking,
      dto.amount,
      `Turno (${METHOD_LABELS[dto.method]})`,
      `turno-pago:${id}:${randomUUID()}`,
    );
    return this.getBooking(id);
  }

  async confirm(companyId: string, clubId: string, id: string) {
    await this.bookings.confirmByClub(companyId, clubId, id);
    return this.getBooking(id);
  }

  /** Libera el turno (un fijo, solo esa fecha). Con seña de Mercado Pago, la devuelve. */
  async release(
    companyId: string,
    clubId: string,
    id: string,
    reason?: string,
  ) {
    const booking = await this.requireBooking(companyId, clubId, id);
    const result = await this.bookings.cancelByClub(
      companyId,
      clubId,
      id,
      reason ||
        (booking.recurringId ? 'Liberado esa semana' : 'Cancelado por el club'),
    );
    return {
      ...result,
      manualDeposit:
        booking.depositPaidAt && booking.depositMethod !== 'mercadopago'
          ? Number(booking.depositAmount)
          : 0,
    };
  }

  // ─── Ocupación ────────────────────────────────────────────────────────────

  /** % de la franja (por defecto 18 a cierre) ocupada por alquileres, por cancha. */
  async occupancy(
    companyId: string,
    clubId: string,
    month?: string,
    fromMinute = 1080,
  ) {
    const club = await this.requireClub(companyId, clubId);
    const today = todayIn(club.timezone);
    const period =
      month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
    const facilities = await this.prisma.facility.findMany({
      where: { clubId, companyId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, bookable: true },
    });
    const [current, previous] = await Promise.all([
      this.periodOccupancy(club, period, today, fromMinute, facilities),
      this.periodOccupancy(
        club,
        previousMonth(period),
        today,
        fromMinute,
        facilities,
      ),
    ]);
    return {
      ...current,
      previous: {
        month: previousMonth(period),
        percent: previous.total.percent,
      },
    };
  }

  async updateSettings(
    companyId: string,
    clubId: string,
    dto: AgendaSettingsDto,
  ) {
    await this.requireClub(companyId, clubId);
    if (
      dto.openMinute !== undefined &&
      dto.closeMinute !== undefined &&
      dto.openMinute >= dto.closeMinute
    )
      throw new BadRequestException(
        'La apertura tiene que ser antes del cierre.',
      );
    if (dto.requireDeposit && !dto.depositAlias?.trim())
      throw new BadRequestException(
        'Para pedir seña, cargá el alias donde transferir.',
      );
    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        openMinute: dto.openMinute,
        closeMinute: dto.closeMinute,
        requireDeposit: dto.requireDeposit,
        depositAlias:
          dto.depositAlias === undefined
            ? undefined
            : dto.depositAlias.trim() || null,
        depositHoldHours: dto.depositHoldHours,
        depositPercent: dto.depositPercent,
      },
    });
    return (await this.agenda(companyId, clubId)).club;
  }

  async updateFacilityDurations(
    companyId: string,
    clubId: string,
    facilityId: string,
    durations: number[],
  ) {
    await this.requireClub(companyId, clubId);
    await this.requireFacility(clubId, facilityId);
    const clean = [...new Set(durations)].filter((value) =>
      (ALLOWED_DURATIONS as readonly number[]).includes(value),
    );
    if (clean.length === 0)
      throw new BadRequestException('Elegí al menos una duración.');
    await this.prisma.facility.update({
      where: { id: facilityId },
      data: { slotDurations: clean.sort((a, b) => a - b) },
    });
    return { slotDurations: clean };
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  private async periodOccupancy(
    club: {
      id: string;
      timezone: string;
      openMinute: number;
      closeMinute: number;
    },
    period: string,
    today: string,
    fromMinute: number,
    facilities: Array<{ id: string; name: string; bookable: boolean }>,
  ) {
    const first = `${period}-01`;
    const [y, m] = period.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const until = last < today ? last : today;
    const windowStart = Math.max(fromMinute, club.openMinute);
    const windowEnd = club.closeMinute;
    const windowMinutes = Math.max(0, windowEnd - windowStart);
    if (first > until || windowMinutes === 0)
      return {
        month: period,
        window: { from: windowStart, to: windowEnd },
        facilities: [],
        total: { available: 0, occupied: 0, percent: 0, noShows: 0 },
      };

    await this.ensureOccurrences(club.id, first, until);
    const rows = await this.prisma.booking.findMany({
      where: {
        clubId: club.id,
        date: { gte: first, lte: until },
        status: 'CONFIRMED',
        kind: 'ALQUILER',
      },
      select: {
        facilityId: true,
        startMinute: true,
        durationMinutes: true,
        attendance: true,
      },
    });
    const days = datesBetween(first, until).length;
    const used = new Map<string, number>();
    let noShows = 0;
    for (const row of rows) {
      const overlap =
        Math.min(row.startMinute + row.durationMinutes, windowEnd) -
        Math.max(row.startMinute, windowStart);
      if (overlap > 0)
        used.set(row.facilityId, (used.get(row.facilityId) ?? 0) + overlap);
      if (row.attendance === 'NO_SHOW') noShows += 1;
    }
    const list = facilities
      .filter((facility) => facility.bookable || used.has(facility.id))
      .map((facility) => {
        const available = days * windowMinutes;
        const occupied = used.get(facility.id) ?? 0;
        return {
          id: facility.id,
          name: facility.name,
          available,
          occupied,
          percent: percentOf(occupied, available),
        };
      });
    const available = list.reduce((sum, item) => sum + item.available, 0);
    const occupied = list.reduce((sum, item) => sum + item.occupied, 0);
    return {
      month: period,
      window: { from: windowStart, to: windowEnd },
      facilities: list,
      total: {
        available,
        occupied,
        percent: percentOf(occupied, available),
        noShows,
      },
    };
  }

  private async toTreasury(
    booking: {
      companyId: string;
      clubId: string;
      facilityId: string;
      date: string;
      startMinute: number;
      contactName: string | null;
      currency: string;
    },
    amount: number,
    what: string,
    reference: string,
  ) {
    try {
      const facility = await this.prisma.facility.findUnique({
        where: { id: booking.facilityId },
        select: { name: true },
      });
      const [, month, day] = booking.date.split('-');
      await this.prisma.financialTransaction.create({
        data: {
          companyId: booking.companyId,
          clubId: booking.clubId,
          type: 'income',
          category: 'Alquiler de canchas',
          amount,
          currency: booking.currency,
          occurredAt: new Date(),
          description: [
            what,
            facility?.name,
            `${day}/${month} ${minuteLabel(booking.startMinute)}`,
            booking.contactName,
          ]
            .filter(Boolean)
            .join(' · '),
          reference,
        },
      });
    } catch (error) {
      // Tesorería no debe frenar la operación del turno.
      this.logger.error(
        `No se registró en Tesorería ${reference}: ${String(error)}`,
      );
    }
  }

  private async getBooking(id: string) {
    const row = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
      select: AGENDA_SELECT,
    });
    return presentBooking(row);
  }

  private validateTime(startMinute: number, duration: number) {
    if (startMinute % 15 !== 0)
      throw new BadRequestException('El horario va de 15 en 15 minutos.');
    if (!(ALLOWED_DURATIONS as readonly number[]).includes(duration))
      throw new BadRequestException(
        'Duración no válida (30, 60, 90 o 120 minutos).',
      );
    if (startMinute < 0 || startMinute + duration > 1440)
      throw new BadRequestException(
        'El turno tiene que terminar antes de la medianoche.',
      );
  }

  private async overlapMessage(
    facilityId: string,
    date: string,
    start: number,
    duration: number,
  ) {
    const rows = await this.prisma.booking.findMany({
      where: { facilityId, date, status: { in: ACTIVE } },
      select: { startMinute: true, durationMinutes: true, contactName: true },
    });
    const hit = rows.find(
      (row) =>
        row.startMinute < start + duration &&
        start < row.startMinute + row.durationMinutes,
    );
    return hit
      ? `Se pisa con el turno de ${hit.contactName ?? 'otra reserva'} (${minuteLabel(hit.startMinute)} a ${minuteLabel(hit.startMinute + hit.durationMinutes)}).`
      : 'Ese horario ya está ocupado.';
  }

  private async requireClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: {
        id: true,
        timezone: true,
        openMinute: true,
        closeMinute: true,
        bookingMode: true,
        requireDeposit: true,
        depositPercent: true,
        depositAlias: true,
        depositHoldHours: true,
      },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    return club;
  }

  private async requireFacility(clubId: string, facilityId: string) {
    const facility = await this.prisma.facility.findFirst({
      where: { id: facilityId, clubId },
      select: { id: true, name: true, hourlyPrice: true, slotDurations: true },
    });
    if (!facility) throw new NotFoundException('Cancha no encontrada');
    return facility;
  }

  private async requireRecurring(
    companyId: string,
    clubId: string,
    id: string,
  ) {
    const rule = await this.prisma.recurringBooking.findFirst({
      where: { id, clubId, companyId },
    });
    if (!rule) throw new NotFoundException('Turno fijo no encontrado');
    return rule;
  }

  private async requireBooking(companyId: string, clubId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, companyId, clubId, status: { in: ACTIVE } },
      select: {
        id: true,
        companyId: true,
        clubId: true,
        facilityId: true,
        date: true,
        startMinute: true,
        status: true,
        depositAmount: true,
        depositPaidAt: true,
        depositMethod: true,
        attendance: true,
        contactName: true,
        currency: true,
        recurringId: true,
      },
    });
    if (!booking) throw new NotFoundException('El turno ya no está activo.');
    return { ...booking, clubId: booking.clubId };
  }
}

function percentOf(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export function previousMonth(period: string) {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 2, 1));
  return date.toISOString().slice(0, 7);
}
