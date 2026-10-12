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
import {
  addDays,
  BOOKING_HOURS,
  bookingWindow,
  dayAbbr,
  isIsoDate,
  roundMoney,
  todayIn,
  zonedToUtc,
} from './booking-time';
import { CreateBookingDto } from './dto/booking.dto';

export const HOLD_MINUTES = 15;
const MAX_ACTIVE_HOLDS_PER_USER = 2;
const ACTIVE: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED'];
const FREEING_RENTAL_STATUSES = [
  'cancelled',
  'canceled',
  'cancelado',
  'cancelada',
];

const USER_BOOKING_SELECT = {
  id: true,
  date: true,
  hour: true,
  startsAt: true,
  status: true,
  currency: true,
  price: true,
  depositAmount: true,
  holdExpiresAt: true,
  paidAt: true,
  refundedAt: true,
  cancelReason: true,
  createdAt: true,
  club: {
    select: { id: true, name: true, logoUrl: true, address: true, city: true },
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

  /** Libera los turnos retenidos cuyo pago no se completó a tiempo. */
  expireStaleHolds(where: Prisma.BookingWhereInput = {}) {
    return this.prisma.booking.updateMany({
      where: {
        ...where,
        status: 'PENDING_PAYMENT',
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
  ) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, isPublic: true, publicFacilities: true },
      select: {
        id: true,
        timezone: true,
        depositPercent: true,
        paymentAccount: { select: { id: true } },
      },
    });
    if (!club) throw new NotFoundException('Sección no disponible');
    const facility = await this.prisma.facility.findFirst({
      where: { id: facilityId, clubId },
      select: { id: true, name: true, bookable: true, hourlyPrice: true },
    });
    if (!facility) throw new NotFoundException('Cancha no encontrada');

    const dates = bookingWindow(club.timezone);
    const date =
      requestedDate && dates.includes(requestedDate) ? requestedDate : dates[0];
    const onlineBooking =
      isMercadoPagoConfigured() &&
      Boolean(club.paymentAccount) &&
      facility.bookable &&
      facility.hourlyPrice !== null;

    await this.expireStaleHolds({ facilityId, date });
    const [rentals, bookings] = await Promise.all([
      this.prisma.facilityRental.findMany({
        where: {
          clubId,
          facilityId,
          day: dayAbbr(date),
          NOT: { status: { in: FREEING_RENTAL_STATUSES, mode: 'insensitive' } },
        },
        select: { hour: true },
      }),
      this.prisma.booking.findMany({
        where: { facilityId, date, status: { in: ACTIVE } },
        select: { hour: true },
      }),
    ]);
    const taken = new Set([...rentals, ...bookings].map(({ hour }) => hour));
    const now = Date.now();

    const price = facility.hourlyPrice ? Number(facility.hourlyPrice) : null;
    return {
      facility: { id: facility.id, name: facility.name },
      date,
      dates,
      timezone: club.timezone,
      onlineBooking,
      currency: 'ARS',
      price,
      depositPercent: club.depositPercent,
      depositAmount:
        price !== null ? roundMoney((price * club.depositPercent) / 100) : null,
      holdMinutes: HOLD_MINUTES,
      slots: BOOKING_HOURS.map((hour) => ({
        hour,
        status:
          zonedToUtc(date, hour, club.timezone).getTime() <= now
            ? 'past'
            : taken.has(hour)
              ? 'taken'
              : 'free',
      })),
    };
  }

  /** Reserva un turno y devuelve el link de pago de la seña. */
  async create(
    firebaseUid: string,
    email: string | undefined,
    dto: CreateBookingDto,
  ) {
    if (!isMercadoPagoConfigured()) {
      throw new ConflictException(
        'Las reservas online todavía no están habilitadas.',
      );
    }
    const user = await this.requireUser(firebaseUid);
    const club = await this.prisma.club.findFirst({
      where: { id: dto.clubId, isPublic: true, publicFacilities: true },
      select: {
        id: true,
        companyId: true,
        name: true,
        timezone: true,
        depositPercent: true,
        paymentAccount: { select: { id: true } },
      },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    if (!club.paymentAccount)
      throw new ConflictException(
        'Este club todavía no recibe reservas online.',
      );

    const facility = await this.prisma.facility.findFirst({
      where: { id: dto.facilityId, clubId: club.id },
      select: { id: true, name: true, bookable: true, hourlyPrice: true },
    });
    if (!facility) throw new NotFoundException('Cancha no encontrada');
    if (!facility.bookable || facility.hourlyPrice === null) {
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
    if (!BOOKING_HOURS.includes(dto.hour))
      throw new BadRequestException('Horario fuera de la grilla del club.');
    const startsAt = zonedToUtc(dto.date, dto.hour, club.timezone);
    if (startsAt.getTime() <= Date.now())
      throw new BadRequestException('Ese horario ya pasó.');

    await this.expireStaleHolds({ userId: user.id });
    const activeHolds = await this.prisma.booking.count({
      where: { userId: user.id, status: 'PENDING_PAYMENT' },
    });
    if (activeHolds >= MAX_ACTIVE_HOLDS_PER_USER) {
      throw new ConflictException(
        'Tenés reservas esperando pago. Pagá o cancelá una antes de reservar otra.',
      );
    }

    const rental = await this.prisma.facilityRental.findFirst({
      where: {
        clubId: club.id,
        facilityId: facility.id,
        day: dayAbbr(dto.date),
        hour: dto.hour,
        NOT: { status: { in: FREEING_RENTAL_STATUSES, mode: 'insensitive' } },
      },
      select: { id: true },
    });
    if (rental) throw new ConflictException('Ese turno ya está ocupado.');

    const price = Number(facility.hourlyPrice);
    const depositAmount = roundMoney((price * club.depositPercent) / 100);
    if (depositAmount <= 0)
      throw new ConflictException(
        'El club no configuró una seña para reservas online.',
      );
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

    await this.expireStaleHolds({
      facilityId: facility.id,
      date: dto.date,
      hour: dto.hour,
    });
    let booking: { id: string };
    try {
      booking = await this.prisma.booking.create({
        data: {
          companyId: club.companyId,
          clubId: club.id,
          facilityId: facility.id,
          userId: user.id,
          date: dto.date,
          hour: dto.hour,
          startsAt,
          price,
          depositAmount,
          holdExpiresAt,
          contactName: user.name,
          contactPhone: dto.contactPhone?.trim() || null,
        },
        select: { id: true },
      });
    } catch (error) {
      // Índice único parcial: otro usuario tomó el turno un instante antes.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ese turno se acaba de reservar. Elegí otro horario.',
        );
      }
      throw error;
    }

    try {
      const config = mpConfig();
      const accessToken = await this.accounts.accessTokenFor(club.id);
      const preference = await this.mp.createPreference(accessToken, {
        title:
          `Seña ${facility.name} - ${club.name} - ${dto.date} ${String(dto.hour).padStart(2, '0')}:00`.slice(
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
        checkoutUrl,
        holdExpiresAt,
        depositAmount,
        price,
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
      where: { id: bookingId, userId: user.id, status: 'PENDING_PAYMENT' },
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
        },
      });
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
        date: { gte: start, lte: end },
        status: {
          in: [
            'CONFIRMED',
            'PENDING_PAYMENT',
            'CANCELLED_BY_CLUB',
            'CANCELLED_BY_USER',
          ],
        },
      },
      orderBy: [{ date: 'asc' }, { hour: 'asc' }],
      select: {
        id: true,
        date: true,
        hour: true,
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
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new UnauthorizedException('Perfil no registrado');
    return user;
  }
}
