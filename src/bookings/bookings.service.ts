import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type BookingStatus } from '@prisma/client';

import {
  isMercadoPagoConfigured,
  MercadoPagoClient,
  mpConfig,
  type MpPayment,
} from '../payments/mercadopago.client';
import { PaymentAccountsService } from '../payments/payment-accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { CLUB_IN_GOOD_STANDING } from '../subscriptions/club-access';
import {
  addDays,
  bookingWindow,
  computeTimes,
  isIsoDate,
  minuteLabel,
  nowMinuteIn,
  roundMoney,
  SLOT_STEP_MINUTES,
  todayIn,
  zonedMinuteToUtc,
} from './booking-time';
import { ensureOccurrences, isOverlapError } from './fixed-turns';
import { CreateBookingDto, MAX_BOOKING_MINUTES } from './dto/booking.dto';

export const HOLD_MINUTES = 15;
const MAX_ACTIVE_HOLDS_PER_USER = 2;
const MAX_OPEN_REQUESTS_PER_USER = 3;
const ACTIVE: BookingStatus[] = ['REQUESTED', 'PENDING_PAYMENT', 'CONFIRMED'];

export type BookingMode = 'off' | 'request' | 'deposit';

/**
 * Modo real de reservas del club: "deposit" necesita Mercado Pago conectado
 * (y la plataforma configurada); si falta, el club no recibe reservas.
 */
export function effectiveBookingMode(club: {
  bookingMode: string;
  paymentAccount: { id: string } | null;
}): BookingMode {
  if (club.bookingMode === 'request') return 'request';
  if (club.bookingMode === 'deposit')
    return isMercadoPagoConfigured() && club.paymentAccount ? 'deposit' : 'off';
  return 'off';
}

/**
 * Largo válido de una reserva: una duración de la cancha, o varios turnos
 * seguidos de una misma duración (p. ej. 2 × 60), hasta 4 horas.
 */
export function isAllowedLength(minutes: number, durations: number[]) {
  if (
    !Number.isInteger(minutes) ||
    minutes <= 0 ||
    minutes > MAX_BOOKING_MINUTES
  )
    return false;
  return durations.some((base) => base > 0 && minutes % base === 0);
}

/** Duración por defecto: 60 si la cancha la ofrece, si no la primera. */
export function defaultDuration(durations: number[]) {
  return durations.includes(60) ? 60 : (durations[0] ?? 60);
}

const USER_BOOKING_SELECT = {
  id: true,
  date: true,
  hour: true,
  startMinute: true,
  durationMinutes: true,
  startsAt: true,
  status: true,
  depositPaidAt: true,
  depositMethod: true,
  mpPreferenceId: true,
  currency: true,
  price: true,
  depositAmount: true,
  holdExpiresAt: true,
  paidAt: true,
  refundedAt: true,
  cancelReason: true,
  createdAt: true,
  club: {
    select: {
      id: true,
      name: true,
      logoUrl: true,
      address: true,
      city: true,
      depositAlias: true,
    },
  },
  facility: { select: { id: true, name: true, typeLabel: true, type: true } },
} satisfies Prisma.BookingSelect;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoClient,
    private readonly accounts: PaymentAccountsService,
  ) {}

  /**
   * Libera turnos retenidos vencidos: seña no pagada a tiempo, o solicitud que
   * el club no respondió antes del horario (holdExpiresAt = inicio del turno).
   */
  expireStaleHolds(where: Prisma.BookingWhereInput = {}) {
    return this.prisma.booking.updateMany({
      where: {
        ...where,
        status: { in: ['PENDING_PAYMENT', 'REQUESTED'] },
        holdExpiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }

  /** Turnos de un día para la app pública (libre / ocupado / pasado). */
  async publicSlots(
    clubId: string,
    facilityId: string,
    requestedDate?: string,
    requestedDuration?: number,
  ) {
    const club = await this.prisma.club.findFirst({
      where: {
        id: clubId,
        isPublic: true,
        publicFacilities: true,
        ...CLUB_IN_GOOD_STANDING,
      },
      select: {
        id: true,
        timezone: true,
        depositPercent: true,
        bookingMode: true,
        openMinute: true,
        closeMinute: true,
        requireDeposit: true,
        depositAlias: true,
        depositHoldHours: true,
        paymentAccount: { select: { id: true } },
      },
    });
    if (!club) throw new NotFoundException('Sección no disponible');
    const facility = await this.prisma.facility.findFirst({
      where: { id: facilityId, clubId },
      select: {
        id: true,
        name: true,
        bookable: true,
        hourlyPrice: true,
        slotDurations: true,
      },
    });
    if (!facility) throw new NotFoundException('Cancha no encontrada');

    const dates = bookingWindow(club.timezone);
    const date =
      requestedDate && dates.includes(requestedDate) ? requestedDate : dates[0];
    const durations = facility.slotDurations.length
      ? facility.slotDurations
      : [60];
    const duration =
      requestedDuration && durations.includes(requestedDuration)
        ? requestedDuration
        : defaultDuration(durations);
    const mode = effectiveBookingMode(club);
    const onlineBooking =
      facility.bookable &&
      (mode === 'request' ||
        (mode === 'deposit' && facility.hourlyPrice !== null));
    const bookingMode: BookingMode = onlineBooking ? mode : 'off';

    await this.expireStaleHolds({ facilityId, date });
    await ensureOccurrences(this.prisma, clubId, date, date);
    const bookings = await this.prisma.booking.findMany({
      where: { facilityId, date, status: { in: ACTIVE } },
      select: { startMinute: true, durationMinutes: true },
    });
    const taken = bookings.map(
      (row) =>
        [row.startMinute, row.startMinute + row.durationMinutes] as [
          number,
          number,
        ],
    );
    const nowMinute =
      date === todayIn(club.timezone) ? nowMinuteIn(club.timezone) : null;
    const times = computeTimes({
      open: club.openMinute,
      close: club.closeMinute,
      duration,
      taken,
      nowMinute,
    });
    // Formato anterior (turnos de 1 hora en punto), para versiones viejas de la app.
    const hourly = computeTimes({
      open: club.openMinute,
      close: club.closeMinute,
      duration: 60,
      taken,
      nowMinute,
    }).filter((time) => time.start % 60 === 0);

    const hourlyPrice = facility.hourlyPrice
      ? Number(facility.hourlyPrice)
      : null;
    const price =
      hourlyPrice === null ? null : roundMoney((hourlyPrice * duration) / 60);
    const manualDeposit =
      bookingMode === 'request' &&
      club.requireDeposit &&
      Boolean(club.depositAlias) &&
      club.depositPercent > 0 &&
      price !== null &&
      price > 0;
    const depositPercent =
      bookingMode === 'deposit' || manualDeposit ? club.depositPercent : 0;
    return {
      facility: { id: facility.id, name: facility.name },
      date,
      dates,
      timezone: club.timezone,
      onlineBooking,
      bookingMode,
      currency: 'ARS',
      price,
      hourlyPrice,
      durations,
      duration,
      depositPercent,
      depositAmount:
        depositPercent > 0 && price !== null
          ? roundMoney((price * depositPercent) / 100)
          : null,
      deposit: manualDeposit
        ? {
            manual: true,
            alias: club.depositAlias,
            holdHours: club.depositHoldHours,
          }
        : null,
      holdMinutes: HOLD_MINUTES,
      times,
      slots: hourly.map((time) => ({
        hour: time.start / 60,
        status: time.status,
      })),
    };
  }

  /**
   * Reserva un turno. Con seña por Mercado Pago devuelve el link de pago; con
   * seña manual queda retenido hasta que el club la registre; sin seña queda
   * como solicitud (REQUESTED) que el club confirma o rechaza.
   */
  async create(
    firebaseUid: string,
    email: string | undefined,
    dto: CreateBookingDto,
  ) {
    const user = await this.requireUser(firebaseUid);
    // El club necesita poder contactar a quien reserva: nombre y celular del perfil.
    const contactPhone = dto.contactPhone?.trim() || user.phone?.trim() || null;
    if (!user.name?.trim() || !contactPhone) {
      throw new BadRequestException(
        'Completá tu nombre y celular en tu perfil para reservar.',
      );
    }
    const club = await this.prisma.club.findFirst({
      where: {
        id: dto.clubId,
        isPublic: true,
        publicFacilities: true,
        ...CLUB_IN_GOOD_STANDING,
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        timezone: true,
        depositPercent: true,
        bookingMode: true,
        openMinute: true,
        closeMinute: true,
        requireDeposit: true,
        depositAlias: true,
        depositHoldHours: true,
        paymentAccount: { select: { id: true } },
      },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    const mode = effectiveBookingMode(club);
    if (mode === 'off')
      throw new ConflictException(
        'Este club todavía no recibe reservas online.',
      );

    const facility = await this.prisma.facility.findFirst({
      where: { id: dto.facilityId, clubId: club.id },
      select: {
        id: true,
        name: true,
        bookable: true,
        hourlyPrice: true,
        slotDurations: true,
      },
    });
    if (!facility) throw new NotFoundException('Cancha no encontrada');
    if (
      !facility.bookable ||
      (mode === 'deposit' && facility.hourlyPrice === null)
    ) {
      throw new ConflictException('Esta cancha no se puede reservar online.');
    }

    if (
      !isIsoDate(dto.date) ||
      !bookingWindow(club.timezone).includes(dto.date)
    ) {
      throw new BadRequestException(
        `Podés reservar desde hoy y hasta ${addDays(todayIn(club.timezone), 13)}.`,
      );
    }
    const durations = facility.slotDurations.length
      ? facility.slotDurations
      : [60];
    const duration = dto.durationMinutes ?? defaultDuration(durations);
    if (!isAllowedLength(duration, durations))
      throw new BadRequestException('Esa duración no está disponible.');
    const startMinute =
      dto.startMinute ?? (dto.hour !== undefined ? dto.hour * 60 : NaN);
    if (
      !Number.isInteger(startMinute) ||
      startMinute % SLOT_STEP_MINUTES !== 0 ||
      startMinute < club.openMinute ||
      startMinute + duration > club.closeMinute
    )
      throw new BadRequestException('Horario fuera de la grilla del club.');
    const startsAt = zonedMinuteToUtc(dto.date, startMinute, club.timezone);
    const endsAt = zonedMinuteToUtc(
      dto.date,
      startMinute + duration,
      club.timezone,
    );
    if (startsAt.getTime() <= Date.now())
      throw new BadRequestException('Ese horario ya pasó.');

    const hourlyPrice =
      facility.hourlyPrice === null ? 0 : Number(facility.hourlyPrice);
    const price = roundMoney((hourlyPrice * duration) / 60);
    const manualDeposit =
      mode === 'request' &&
      club.requireDeposit &&
      Boolean(club.depositAlias) &&
      club.depositPercent > 0 &&
      price > 0;

    await this.expireStaleHolds({ userId: user.id });
    const pendingStatus =
      mode === 'request' && !manualDeposit ? 'REQUESTED' : 'PENDING_PAYMENT';
    const pending = await this.prisma.booking.count({
      where: { userId: user.id, status: pendingStatus },
    });
    if (
      pendingStatus === 'PENDING_PAYMENT' &&
      pending >= MAX_ACTIVE_HOLDS_PER_USER
    ) {
      throw new ConflictException(
        'Tenés reservas esperando la seña. Pagá o cancelá una antes de reservar otra.',
      );
    }
    if (
      pendingStatus === 'REQUESTED' &&
      pending >= MAX_OPEN_REQUESTS_PER_USER
    ) {
      throw new ConflictException(
        'Tenés varias solicitudes sin respuesta. Esperá a que el club confirme o cancelá alguna.',
      );
    }

    const depositAmount =
      mode === 'deposit' || manualDeposit
        ? roundMoney((price * club.depositPercent) / 100)
        : 0;
    if (mode === 'deposit' && depositAmount <= 0)
      throw new ConflictException(
        'El club no configuró una seña para reservas online.',
      );
    // Solicitud: retiene hasta que empieza. Seña manual: las horas que fija el club.
    // Mercado Pago: unos minutos para pagar.
    const holdExpiresAt =
      mode === 'deposit'
        ? new Date(Date.now() + HOLD_MINUTES * 60 * 1000)
        : manualDeposit
          ? new Date(
              Math.min(
                startsAt.getTime(),
                Date.now() + club.depositHoldHours * 3_600_000,
              ),
            )
          : startsAt;

    await this.expireStaleHolds({ facilityId: facility.id, date: dto.date });
    // Los turnos fijos de ese día tienen que existir antes de ocupar el horario.
    await ensureOccurrences(this.prisma, club.id, dto.date, dto.date);
    let booking: { id: string };
    try {
      booking = await this.prisma.booking.create({
        data: {
          companyId: club.companyId,
          clubId: club.id,
          facilityId: facility.id,
          userId: user.id,
          date: dto.date,
          hour: Math.floor(startMinute / 60),
          startMinute,
          durationMinutes: duration,
          startsAt,
          endsAt,
          price,
          depositAmount,
          holdExpiresAt,
          status: pendingStatus,
          source: 'APP',
          contactName: user.name,
          contactPhone,
        },
        select: { id: true },
      });
    } catch (error) {
      // Restricción de solapes: otro turno tomó ese horario un instante antes.
      if (isOverlapError(error)) {
        throw new ConflictException(
          'Ese horario se acaba de ocupar. Elegí otro.',
        );
      }
      throw error;
    }

    if (mode === 'request') {
      return {
        bookingId: booking.id,
        status: pendingStatus,
        checkoutUrl: null,
        holdExpiresAt,
        depositAmount,
        price,
        deposit: manualDeposit
          ? { manual: true, alias: club.depositAlias, amount: depositAmount }
          : null,
      };
    }

    try {
      const config = mpConfig();
      const accessToken = await this.accounts.accessTokenFor(club.id);
      const preference = await this.mp.createPreference(accessToken, {
        title:
          `Seña ${facility.name} - ${club.name} - ${dto.date} ${minuteLabel(startMinute)}`.slice(
            0,
            250,
          ),
        amount: depositAmount,
        currency: 'ARS',
        externalReference: booking.id,
        payerEmail: email ?? user.email,
        notificationUrl: `${config.publicApiUrl}/payments/mercadopago/webhook?booking=${booking.id}`,
        backUrl: `${config.publicAppUrl}/explorar/reservas/${booking.id}`,
        expiresAt: holdExpiresAt,
      });
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { mpPreferenceId: preference.id },
      });
      const checkoutUrl = config.testMode
        ? (preference.sandbox_init_point ?? preference.init_point)
        : preference.init_point;
      return {
        bookingId: booking.id,
        status: 'PENDING_PAYMENT' as const,
        checkoutUrl,
        holdExpiresAt,
        depositAmount,
        price,
        deposit: null,
      };
    } catch (error) {
      // Sin link de pago no tiene sentido retener el turno.
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'EXPIRED' },
      });
      throw error;
    }
  }

  async listForUser(firebaseUid: string) {
    const user = await this.requireUser(firebaseUid);
    await this.expireStaleHolds({ userId: user.id });
    return this.prisma.booking.findMany({
      where: { userId: user.id, status: { not: 'EXPIRED' } },
      orderBy: { startsAt: 'desc' },
      take: 50,
      select: USER_BOOKING_SELECT,
    });
  }

  async getForUser(firebaseUid: string, bookingId: string) {
    const user = await this.requireUser(firebaseUid);
    await this.expireStaleHolds({ id: bookingId });
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId: user.id },
      select: USER_BOOKING_SELECT,
    });
    if (!booking) throw new NotFoundException('Reserva no encontrada');
    return booking;
  }

  /** Al volver de Mercado Pago: verifica el pago contra la API (no confía en la URL). */
  async syncForUser(firebaseUid: string, bookingId: string, paymentId: string) {
    const user = await this.requireUser(firebaseUid);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId: user.id },
      select: { id: true },
    });
    if (!booking) throw new NotFoundException('Reserva no encontrada');
    await this.applyPayment(bookingId, paymentId);
    return this.getForUser(firebaseUid, bookingId);
  }

  async cancelByUser(firebaseUid: string, bookingId: string) {
    const user = await this.requireUser(firebaseUid);
    const result = await this.prisma.booking.updateMany({
      where: {
        id: bookingId,
        userId: user.id,
        status: { in: ['PENDING_PAYMENT', 'REQUESTED'] },
      },
      data: { status: 'CANCELLED_BY_USER', cancelledAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Solo podés cancelar reservas sin pagar. Para una reserva confirmada, escribile al club.',
      );
    }
    return { ok: true };
  }

  /**
   * Aplica el estado real de un pago (consultado a Mercado Pago con el token del
   * club) a la reserva. Idempotente: lo usan el webhook y la vuelta del checkout.
   */
  async applyPayment(bookingId: string, paymentId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Reserva no encontrada');

    const accessToken = await this.accounts.accessTokenFor(booking.clubId);
    const payment = await this.mp.getPayment(accessToken, paymentId);

    if (payment.external_reference !== booking.id) {
      this.logger.warn(
        `Pago ${paymentId} no corresponde a la reserva ${booking.id}`,
      );
      throw new BadRequestException('El pago no corresponde a esta reserva');
    }

    if (payment.status === 'approved')
      return this.confirm(booking, payment, accessToken);

    if (payment.status === 'refunded' || payment.status === 'charged_back') {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          mpPaymentId: String(payment.id),
          mpPaymentStatus: payment.status,
          refundedAt: booking.refundedAt ?? new Date(),
        },
      });
      return;
    }

    // rechazado / cancelado / en proceso: solo registramos; la retención vence sola.
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        mpPaymentStatus: payment.status,
        ...(booking.mpPaymentId ? {} : { mpPaymentId: String(payment.id) }),
      },
    });
  }

  private async confirm(
    booking: {
      id: string;
      status: BookingStatus;
      depositAmount: Prisma.Decimal;
      currency: string;
      mpPaymentId: string | null;
      refundedAt: Date | null;
    },
    payment: MpPayment,
    accessToken: string,
  ) {
    if (
      booking.mpPaymentId === String(payment.id) &&
      (booking.status === 'CONFIRMED' || booking.refundedAt)
    )
      return;

    const amountOk =
      payment.transaction_amount + 0.001 >= Number(booking.depositAmount);
    const currencyOk = payment.currency_id === booking.currency;
    if (!amountOk || !currencyOk) {
      this.logger.error(
        `Pago ${payment.id} con monto/moneda distinto para la reserva ${booking.id}`,
      );
      await this.refundAndCancel(
        booking.id,
        String(payment.id),
        accessToken,
        'El monto pagado no coincide con la seña.',
      );
      return;
    }

    try {
      // Confirma si sigue retenida, o si venció pero nadie tomó el turno (pago tardío).
      const updated = await this.prisma.booking.updateMany({
        where: {
          id: booking.id,
          status: { in: ['PENDING_PAYMENT', 'EXPIRED'] },
        },
        data: {
          status: 'CONFIRMED',
          mpPaymentId: String(payment.id),
          mpPaymentStatus: payment.status,
          paidAt: payment.date_approved
            ? new Date(payment.date_approved)
            : new Date(),
          depositPaidAt: payment.date_approved
            ? new Date(payment.date_approved)
            : new Date(),
          depositMethod: 'mercadopago',
          paidAmount: payment.transaction_amount,
        },
      });
      if (updated.count === 1) {
        // Solo quien confirma registra el cobro (el webhook y la vuelta pueden llegar juntos).
        await this.recordDepositInTreasury(booking.id, payment);
      }
      if (updated.count === 0 && booking.status !== 'CONFIRMED') {
        // Fue cancelada mientras se pagaba: devolver.
        await this.refundAndCancel(
          booking.id,
          String(payment.id),
          accessToken,
          'La reserva se canceló antes de acreditarse el pago.',
        );
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Pagó tarde y el turno ya lo tomó otra persona: devolución automática.
        await this.refundAndCancel(
          booking.id,
          String(payment.id),
          accessToken,
          'El turno se ocupó antes de acreditarse el pago.',
        );
        return;
      }
      throw error;
    }
  }

  private async refundAndCancel(
    bookingId: string,
    paymentId: string,
    accessToken: string,
    reason: string,
  ) {
    await this.mp.refundPayment(accessToken, paymentId);
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED_BY_CLUB',
        mpPaymentId: paymentId,
        mpPaymentStatus: 'refunded',
        refundedAt: new Date(),
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    });
    await this.recordRefundInTreasury(bookingId, paymentId);
  }

  // ----- Tesorería -----

  /**
   * Seña cobrada → ingreso en Tesorería, y la comisión de Mercado Pago como
   * gasto. Idempotente: la referencia mp:<pago> es única en la base.
   */
  private async recordDepositInTreasury(bookingId: string, payment: MpPayment) {
    const booking = await this.treasuryContext(bookingId);
    if (!booking) return;
    const occurredAt = payment.date_approved
      ? new Date(payment.date_approved)
      : new Date();
    const fee = roundMoney(
      (payment.fee_details ?? []).reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0,
      ),
    );
    try {
      await this.prisma.financialTransaction.createMany({
        skipDuplicates: true,
        data: [
          {
            companyId: booking.companyId,
            clubId: booking.clubId,
            type: 'income',
            category: 'Reservas online',
            amount: payment.transaction_amount,
            currency: payment.currency_id,
            occurredAt,
            description: `Seña de reserva · ${booking.label}`,
            reference: `mp:${payment.id}`,
          },
          ...(fee > 0
            ? [
                {
                  companyId: booking.companyId,
                  clubId: booking.clubId,
                  type: 'expense' as const,
                  category: 'Comisión Mercado Pago',
                  amount: fee,
                  currency: payment.currency_id,
                  occurredAt,
                  description: `Comisión por la seña · ${booking.label}`,
                  reference: `mp-fee:${payment.id}`,
                },
              ]
            : []),
        ],
      });
    } catch (error) {
      // Tesorería no debe frenar la confirmación de la reserva.
      this.logger.error(
        `No se registró en Tesorería el pago ${payment.id}: ${String(error)}`,
      );
    }
  }

  /** Devolución de una seña → gasto en Tesorería (y el ingreso, si no estaba). */
  private async recordRefundInTreasury(bookingId: string, paymentId: string) {
    const booking = await this.treasuryContext(bookingId);
    if (!booking) return;
    const base = {
      companyId: booking.companyId,
      clubId: booking.clubId,
      amount: booking.depositAmount,
      currency: booking.currency,
    };
    try {
      await this.prisma.financialTransaction.createMany({
        skipDuplicates: true,
        data: [
          {
            ...base,
            type: 'income',
            category: 'Reservas online',
            occurredAt: booking.paidAt ?? new Date(),
            description: `Seña de reserva · ${booking.label}`,
            reference: `mp:${paymentId}`,
          },
          {
            ...base,
            type: 'expense',
            category: 'Devolución de señas',
            occurredAt: new Date(),
            description: `Devolución de seña · ${booking.label}`,
            reference: `mp-refund:${paymentId}`,
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        `No se registró en Tesorería la devolución ${paymentId}: ${String(error)}`,
      );
    }
  }

  private async treasuryContext(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        companyId: true,
        clubId: true,
        date: true,
        startMinute: true,
        depositAmount: true,
        currency: true,
        paidAt: true,
        contactName: true,
        facility: { select: { name: true } },
      },
    });
    if (!booking) return null;
    const when = `${booking.date} ${minuteLabel(booking.startMinute)}`;
    return {
      ...booking,
      label: [booking.facility.name, when, booking.contactName]
        .filter(Boolean)
        .join(' · '),
    };
  }

  // ----- Consola del club -----

  async listForClub(
    companyId: string,
    clubId: string,
    from?: string,
    to?: string,
  ) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { timezone: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    await this.expireStaleHolds({ clubId });
    const start = from && isIsoDate(from) ? from : todayIn(club.timezone);
    const end = to && isIsoDate(to) ? to : addDays(start, 13);
    return this.prisma.booking.findMany({
      where: {
        companyId,
        clubId,
        source: 'APP',
        date: { gte: start, lte: end },
        status: {
          in: [
            'REQUESTED',
            'CONFIRMED',
            'PENDING_PAYMENT',
            'CANCELLED_BY_CLUB',
            'CANCELLED_BY_USER',
          ],
        },
      },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      select: {
        id: true,
        date: true,
        hour: true,
        startMinute: true,
        durationMinutes: true,
        depositPaidAt: true,
        depositMethod: true,
        status: true,
        currency: true,
        price: true,
        depositAmount: true,
        holdExpiresAt: true,
        contactName: true,
        contactPhone: true,
        paidAt: true,
        refundedAt: true,
        cancelReason: true,
        createdAt: true,
        facility: { select: { id: true, name: true } },
        user: { select: { name: true, email: true } },
      },
    });
  }

  /** El club acepta una solicitud sin seña. */
  async confirmByClub(companyId: string, clubId: string, bookingId: string) {
    await this.expireStaleHolds({ id: bookingId });
    const result = await this.prisma.booking.updateMany({
      where: {
        id: bookingId,
        companyId,
        clubId,
        // Solicitud sin seña, o seña manual que el club decide no exigir.
        OR: [
          { status: 'REQUESTED' },
          { status: 'PENDING_PAYMENT', mpPreferenceId: null },
        ],
      },
      data: { status: 'CONFIRMED' },
    });
    if (result.count === 0)
      throw new ConflictException(
        'La solicitud ya no está pendiente (fue cancelada o venció).',
      );
    return { ok: true };
  }

  /** El club cancela; si había seña cobrada, se devuelve completa por Mercado Pago. */
  async cancelByClub(
    companyId: string,
    clubId: string,
    bookingId: string,
    reason?: string,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, companyId, clubId },
    });
    if (!booking) throw new NotFoundException('Reserva no encontrada');
    if (!ACTIVE.includes(booking.status))
      throw new ConflictException('La reserva ya no está activa.');

    const cleanReason = reason?.trim() || 'Cancelada por el club';
    if (
      booking.status === 'CONFIRMED' &&
      booking.mpPaymentId &&
      !booking.refundedAt
    ) {
      const accessToken = await this.accounts.accessTokenFor(clubId);
      await this.refundAndCancel(
        booking.id,
        booking.mpPaymentId,
        accessToken,
        cleanReason,
      );
      return { ok: true, refunded: true };
    }
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED_BY_CLUB',
        cancelReason: cleanReason,
        cancelledAt: new Date(),
      },
    });
    return { ok: true, refunded: false };
  }

  private async requireUser(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!user) throw new UnauthorizedException('Perfil no registrado');
    return user;
  }
}
