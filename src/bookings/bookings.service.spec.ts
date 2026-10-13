import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { BookingsService } from './bookings.service';
import { bookingWindow } from './booking-time';

const TZ = 'America/Argentina/Buenos_Aires';

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('BookingsService', () => {
  let prisma: any;
  let mp: any;
  let accounts: any;
  let service: BookingsService;
  const tomorrow = bookingWindow(TZ)[1];

  beforeEach(() => {
    Object.assign(process.env, {
      MP_CLIENT_ID: 'id',
      MP_CLIENT_SECRET: 'secret',
      MP_REDIRECT_URI: 'https://api.test/payments/mercadopago/oauth/callback',
      PUBLIC_API_URL: 'https://api.test',
      PUBLIC_APP_URL: 'https://app.test',
      PAYMENT_TOKENS_KEY: Buffer.alloc(32, 1).toString('base64'),
      MP_TEST_MODE: 'false',
    });
    prisma = {
      club: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'club-a',
          companyId: 'company-a',
          name: 'Club A',
          timezone: TZ,
          depositPercent: 30,
          bookingMode: 'deposit',
          paymentAccount: { id: 'acc' },
        }),
      },
      facility: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'f1',
          name: 'Cancha 1',
          bookable: true,
          hourlyPrice: new Prisma.Decimal(20000),
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          name: 'Ana',
          email: 'ana@mail.com',
          phone: '11 5555-1234',
        }),
      },
      facilityRental: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      booking: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'b1' }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      financialTransaction: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mp = {
      createPreference: jest.fn().mockResolvedValue({
        id: 'pref-1',
        init_point: 'https://mp/checkout',
        sandbox_init_point: 'https://sandbox/checkout',
      }),
      getPayment: jest.fn(),
      refundPayment: jest.fn().mockResolvedValue({ id: 9, status: 'approved' }),
    };
    accounts = { accessTokenFor: jest.fn().mockResolvedValue('seller-token') };
    service = new BookingsService(prisma, mp, accounts);
  });

  describe('create', () => {
    const dto = () => ({
      clubId: 'club-a',
      facilityId: 'f1',
      date: tomorrow,
      hour: 18,
    });

    it('holds the slot and returns the seller checkout with the deposit', async () => {
      const result = await service.create('fb-ana', 'ana@mail.com', dto());

      expect(prisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            facilityId: 'f1',
            date: tomorrow,
            hour: 18,
            price: 20000,
            depositAmount: 6000,
            userId: 'u1',
            contactName: 'Ana',
            contactPhone: '11 5555-1234',
          }),
        }),
      );
      expect(accounts.accessTokenFor).toHaveBeenCalledWith('club-a');
      expect(mp.createPreference).toHaveBeenCalledWith(
        'seller-token',
        expect.objectContaining({
          amount: 6000,
          currency: 'ARS',
          externalReference: 'b1',
          notificationUrl:
            'https://api.test/payments/mercadopago/webhook?booking=b1',
          backUrl: 'https://app.test/explorar/reservas/b1',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          bookingId: 'b1',
          checkoutUrl: 'https://mp/checkout',
          depositAmount: 6000,
        }),
      );
    });

    it('requires name and phone in the profile before holding a slot', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Ana',
        email: 'ana@mail.com',
        phone: null,
      });

      await expect(
        service.create('fb-ana', 'ana@mail.com', dto()),
      ).rejects.toThrow('Completá tu nombre y celular');
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects a slot taken by a fixed club rental', async () => {
      prisma.facilityRental.findFirst.mockResolvedValue({ id: 'r1' });
      await expect(service.create('fb-ana', undefined, dto())).rejects.toThrow(
        'Ese turno ya está ocupado.',
      );
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('turns a concurrent double booking into a 409', async () => {
      prisma.booking.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create('fb-ana', undefined, dto()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mp.createPreference).not.toHaveBeenCalled();
    });

    it('releases the slot if Mercado Pago fails to create the checkout', async () => {
      mp.createPreference.mockRejectedValue(new Error('mp down'));
      await expect(service.create('fb-ana', undefined, dto())).rejects.toThrow(
        'mp down',
      );
      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { status: 'EXPIRED' },
      });
    });

    it('limits simultaneous unpaid holds per user', async () => {
      prisma.booking.count.mockResolvedValue(2);
      await expect(
        service.create('fb-ana', undefined, dto()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects clubs without a connected account and facilities without price', async () => {
      prisma.club.findFirst.mockResolvedValueOnce({
        id: 'club-a',
        companyId: 'c',
        timezone: TZ,
        depositPercent: 30,
        paymentAccount: null,
      });
      await expect(service.create('fb-ana', undefined, dto())).rejects.toThrow(
        'todavía no recibe reservas online',
      );
      prisma.facility.findFirst.mockResolvedValueOnce({
        id: 'f1',
        name: 'x',
        bookable: true,
        hourlyPrice: null,
      });
      await expect(service.create('fb-ana', undefined, dto())).rejects.toThrow(
        'no se puede reservar online',
      );
    });

    it('rejects dates outside the 14-day window and hours outside the grid', async () => {
      await expect(
        service.create('fb-ana', undefined, { ...dto(), date: '2030-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create('fb-ana', undefined, { ...dto(), hour: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('without deposit (request mode)', () => {
      beforeEach(() => {
        prisma.club.findFirst.mockResolvedValue({
          id: 'club-a',
          companyId: 'company-a',
          name: 'Club A',
          timezone: TZ,
          depositPercent: 30,
          bookingMode: 'request',
          paymentAccount: null,
        });
      });

      it('holds the slot as a request until it starts, without Mercado Pago', async () => {
        delete process.env.MP_CLIENT_SECRET;
        const result = await service.create('fb-ana', undefined, dto());

        expect(prisma.booking.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'REQUESTED',
              depositAmount: 0,
              price: 20000,
              contactPhone: '11 5555-1234',
            }),
          }),
        );
        const data = prisma.booking.create.mock.calls[0][0].data;
        expect(data.holdExpiresAt).toEqual(data.startsAt);
        expect(mp.createPreference).not.toHaveBeenCalled();
        expect(result).toEqual(
          expect.objectContaining({ status: 'REQUESTED', checkoutUrl: null }),
        );
      });

      it('limits open requests per user', async () => {
        prisma.booking.count.mockResolvedValue(3);
        await expect(
          service.create('fb-ana', undefined, dto()),
        ).rejects.toThrow('solicitudes sin respuesta');
      });

      it('lets the club confirm only pending requests', async () => {
        prisma.booking.updateMany.mockResolvedValue({ count: 1 });
        await expect(
          service.confirmByClub('company-a', 'club-a', 'b1'),
        ).resolves.toEqual({ ok: true });
        expect(prisma.booking.updateMany).toHaveBeenLastCalledWith({
          where: {
            id: 'b1',
            companyId: 'company-a',
            clubId: 'club-a',
            status: 'REQUESTED',
          },
          data: { status: 'CONFIRMED' },
        });

        prisma.booking.updateMany.mockResolvedValue({ count: 0 });
        await expect(
          service.confirmByClub('company-a', 'club-a', 'b1'),
        ).rejects.toBeInstanceOf(ConflictException);
      });
    });

    it('is disabled when the platform is not configured', async () => {
      delete process.env.MP_CLIENT_SECRET;
      await expect(service.create('fb-ana', undefined, dto())).rejects.toThrow(
        'todavía no recibe reservas online',
      );
    });
  });

  describe('applyPayment', () => {
    const pending = {
      id: 'b1',
      clubId: 'club-a',
      status: 'PENDING_PAYMENT',
      depositAmount: new Prisma.Decimal(6000),
      currency: 'ARS',
      mpPaymentId: null,
      refundedAt: null,
      companyId: 'company-a',
      date: '2026-10-20',
      hour: 18,
      paidAt: null,
      contactName: 'Ana',
      facility: { name: 'Cancha 1' },
    };
    const approved = {
      id: 555,
      status: 'approved',
      external_reference: 'b1',
      transaction_amount: 6000,
      currency_id: 'ARS',
      date_approved: '2026-10-19T12:00:00Z',
    };

    beforeEach(() => prisma.booking.findUnique.mockResolvedValue(pending));

    it('confirms the booking after checking the payment with the seller token', async () => {
      mp.getPayment.mockResolvedValue(approved);
      await service.applyPayment('b1', '555');
      expect(mp.getPayment).toHaveBeenCalledWith('seller-token', '555');
      expect(prisma.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', status: { in: ['PENDING_PAYMENT', 'EXPIRED'] } },
          data: expect.objectContaining({
            status: 'CONFIRMED',
            mpPaymentId: '555',
          }),
        }),
      );
      expect(mp.refundPayment).not.toHaveBeenCalled();
    });

    it('records the deposit and the Mercado Pago fee in the club treasury', async () => {
      mp.getPayment.mockResolvedValue({
        ...approved,
        fee_details: [{ type: 'mercadopago_fee', amount: 399.6 }],
      });
      await service.applyPayment('b1', '555');

      const { data, skipDuplicates } =
        prisma.financialTransaction.createMany.mock.calls[0][0];
      expect(skipDuplicates).toBe(true);
      expect(data).toEqual([
        expect.objectContaining({
          companyId: 'company-a',
          clubId: 'club-a',
          type: 'income',
          category: 'Reservas online',
          amount: 6000,
          reference: 'mp:555',
          description: 'Seña de reserva · Cancha 1 · 2026-10-20 18:00 · Ana',
        }),
        expect.objectContaining({
          type: 'expense',
          category: 'Comisión Mercado Pago',
          amount: 399.6,
          reference: 'mp-fee:555',
        }),
      ]);
    });

    it('does not record twice when the booking was already confirmed by the webhook', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      prisma.booking.findUnique.mockResolvedValue({
        ...pending,
        status: 'CONFIRMED',
        mpPaymentId: '554',
      });
      mp.getPayment.mockResolvedValue(approved);
      await service.applyPayment('b1', '555');
      expect(prisma.financialTransaction.createMany).not.toHaveBeenCalled();
    });

    it('rejects a payment that belongs to another booking', async () => {
      mp.getPayment.mockResolvedValue({
        ...approved,
        external_reference: 'other',
      });
      await expect(service.applyPayment('b1', '555')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('refunds when the paid amount or currency does not match', async () => {
      mp.getPayment.mockResolvedValue({ ...approved, transaction_amount: 10 });
      await service.applyPayment('b1', '555');
      expect(mp.refundPayment).toHaveBeenCalledWith('seller-token', '555');
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED_BY_CLUB',
            refundedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('refunds a late payment when someone else already took the slot', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...pending,
        status: 'EXPIRED',
      });
      mp.getPayment.mockResolvedValue(approved);
      prisma.booking.updateMany.mockRejectedValue(uniqueViolation());
      await service.applyPayment('b1', '555');
      expect(mp.refundPayment).toHaveBeenCalledWith('seller-token', '555');
    });

    it('is idempotent for an already confirmed or refunded payment', async () => {
      mp.getPayment.mockResolvedValue(approved);
      prisma.booking.findUnique.mockResolvedValue({
        ...pending,
        status: 'CONFIRMED',
        mpPaymentId: '555',
      });
      await service.applyPayment('b1', '555');
      prisma.booking.findUnique.mockResolvedValue({
        ...pending,
        status: 'CANCELLED_BY_CLUB',
        mpPaymentId: '555',
        refundedAt: new Date(),
      });
      await service.applyPayment('b1', '555');
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
      expect(mp.refundPayment).not.toHaveBeenCalled();
    });

    it('only records rejected payments (the hold expires by itself)', async () => {
      mp.getPayment.mockResolvedValue({ ...approved, status: 'rejected' });
      await service.applyPayment('b1', '555');
      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { mpPaymentStatus: 'rejected', mpPaymentId: '555' },
      });
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('cancellations', () => {
    it('lets the user cancel only unpaid bookings', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.cancelByUser('fb-ana', 'b1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'b1',
            userId: 'u1',
            status: { in: ['PENDING_PAYMENT', 'REQUESTED'] },
          },
        }),
      );
    });

    it('refunds the deposit when the club cancels a paid booking', async () => {
      prisma.booking.findFirst.mockResolvedValue({
        id: 'b1',
        status: 'CONFIRMED',
        mpPaymentId: '555',
        refundedAt: null,
      });
      prisma.booking.findUnique.mockResolvedValue({
        companyId: 'company-a',
        clubId: 'club-a',
        date: '2026-10-20',
        hour: 18,
        depositAmount: 6000,
        currency: 'ARS',
        paidAt: new Date('2026-10-19T12:00:00Z'),
        contactName: 'Ana',
        facility: { name: 'Cancha 1' },
      });
      const result = await service.cancelByClub(
        'company-a',
        'club-a',
        'b1',
        'Lluvia',
      );
      expect(prisma.booking.findFirst).toHaveBeenCalledWith({
        where: { id: 'b1', companyId: 'company-a', clubId: 'club-a' },
      });
      expect(mp.refundPayment).toHaveBeenCalledWith('seller-token', '555');
      expect(result).toEqual({ ok: true, refunded: true });
      // La devolución queda como gasto en Tesorería.
      const { data } = prisma.financialTransaction.createMany.mock.calls[0][0];
      expect(data[1]).toEqual(
        expect.objectContaining({
          type: 'expense',
          category: 'Devolución de señas',
          reference: 'mp-refund:555',
        }),
      );
    });

    it('cancels an unpaid hold without calling Mercado Pago', async () => {
      prisma.booking.findFirst.mockResolvedValue({
        id: 'b1',
        status: 'PENDING_PAYMENT',
        mpPaymentId: null,
        refundedAt: null,
      });
      const result = await service.cancelByClub('company-a', 'club-a', 'b1');
      expect(mp.refundPayment).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, refunded: false });
    });
  });

  describe('publicSlots', () => {
    it('marks taken slots from rentals and active bookings and hides prices when offline', async () => {
      prisma.facilityRental.findMany.mockResolvedValue([{ hour: 18 }]);
      prisma.booking.findMany.mockResolvedValue([{ hour: 20 }]);
      const result = await service.publicSlots('club-a', 'f1', tomorrow);
      const status = Object.fromEntries(
        result.slots.map((slot) => [slot.hour, slot.status]),
      );
      expect(status[18]).toBe('taken');
      expect(status[20]).toBe('taken');
      expect(status[19]).toBe('free');
      expect(result.depositAmount).toBe(6000);
      expect(result.onlineBooking).toBe(true);
      expect(result.dates).toHaveLength(14);
    });
  });
});
