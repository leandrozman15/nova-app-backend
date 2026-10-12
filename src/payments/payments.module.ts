import { Module } from '@nestjs/common';

import { BookingsService } from '../bookings/bookings.service';
import {
  ClubBookingsController,
  MyBookingsController,
  PublicSlotsController,
} from '../bookings/bookings.controller';
import { MercadoPagoClient } from './mercadopago.client';
import { PaymentAccountsService } from './payment-accounts.service';
import {
  ClubPaymentsController,
  MercadoPagoCallbacksController,
} from './payments.controller';

/** Reservas online con seña por Mercado Pago (cuenta propia de cada club). */
@Module({
  controllers: [
    PublicSlotsController,
    MyBookingsController,
    ClubBookingsController,
    ClubPaymentsController,
    MercadoPagoCallbacksController,
  ],
  providers: [MercadoPagoClient, PaymentAccountsService, BookingsService],
})
export class PaymentsModule {}
