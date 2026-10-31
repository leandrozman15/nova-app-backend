import { Module } from '@nestjs/common';

import { AgendaController } from '../bookings/agenda.controller';
import { AgendaService } from '../bookings/agenda.service';
import { BookingsService } from '../bookings/bookings.service';
import {
  ClubBookingsController,
  MyBookingsController,
  PublicSlotsController,
} from '../bookings/bookings.controller';
import { FeePaymentsService } from './fee-payments.service';
import { MercadoPagoClient } from './mercadopago.client';
import { PaymentAccountsService } from './payment-accounts.service';
import {
  ClubPaymentsController,
  FeePaymentsController,
  GuardianChildrenController,
  CallupResponsesController,
  MercadoPagoCallbacksController,
} from './payments.controller';

/** Cobros online por Mercado Pago (señas de reservas y cuotas de socio) en la cuenta propia de cada club. */
@Module({
  controllers: [
    PublicSlotsController,
    MyBookingsController,
    ClubBookingsController,
    AgendaController,
    ClubPaymentsController,
    MercadoPagoCallbacksController,
    FeePaymentsController,
    GuardianChildrenController,
    CallupResponsesController,
  ],
  providers: [
    MercadoPagoClient,
    PaymentAccountsService,
    BookingsService,
    AgendaService,
    FeePaymentsService,
  ],
})
export class PaymentsModule {}
