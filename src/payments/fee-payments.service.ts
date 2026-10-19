import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { roundMoney } from '../bookings/booking-time';
import { PrismaService } from '../prisma/prisma.service';
import {
  MercadoPagoClient,
  mpConfig,
  type MpPayment,
} from './mercadopago.client';
import { PaymentAccountsService } from './payment-accounts.service';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Referencia externa de Mercado Pago de una cuota (la de reservas es el id pelado). */
export const feeReference = (feeId: string) => `fee:${feeId}`;

/**
 * Cobro de cuotas de socio por Mercado Pago: la plata va directo a la cuenta
 * conectada del club (la misma de las reservas). El estado de la cuota solo
 * cambia cuando se consulta el pago a la API de Mercado Pago con el token del
 * club; la notificación del webhook o la vuelta del checkout nunca bastan.
 */
@Injectable()
export class FeePaymentsService {
  private readonly logger = new Logger(FeePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoClient,
    private readonly accounts: PaymentAccountsService,
  ) {}

  /** La cuota es del propio socio/jugador (ficha vinculada a su cuenta). */
  private async assertOwner(
    firebaseUid: string,
    fee: { clubId: string; playerId: string },
  ) {
    const [player, membership] = await Promise.all([
      this.prisma.player.findFirst({
        where: { id: fee.playerId, authUid: firebaseUid },
        select: { id: true },
      }),
      this.prisma.clubMembership.findFirst({
        where: {
          clubId: fee.clubId,
          playerId: fee.playerId,
          status: 'ACTIVA',
          user: { is: { firebaseUid } },
        },
        select: { id: true },
      }),
    ]);
    if (!player && !membership)
      throw new ForbiddenException('Esta cuota no es de tu cuenta');
  }

  private async loadForOwner(
    companyId: string,
    firebaseUid: string,
    feeId: string,
  ) {
    const fee = await this.prisma.playerPayment.findFirst({
      where: { id: feeId, companyId },
      include: { club: { select: { name: true } } },
    });
    if (!fee) throw new NotFoundException('Cuota no encontrada');
    await this.assertOwner(firebaseUid, fee);
    return fee;
  }

  /** Crea el link de pago (Checkout Pro) de una cuota pendiente. */
  async createCheckout(companyId: string, firebaseUid: string, feeId: string) {
    const fee = await this.loadForOwner(companyId, firebaseUid, feeId);
    if (fee.status === 'paid')
      throw new ConflictException('Esta cuota ya está pagada');

    const amount = roundMoney(Number(fee.amount));
    if (!(amount > 0))
      throw new BadRequestException('La cuota no tiene un monto a cobrar');
    if (!(await this.accounts.isConnected(fee.clubId)))
      throw new BadRequestException(
        'El club todavía no habilitó el pago online. Abonala en la secretaría.',
      );

    const user = await this.prisma.user.findFirst({
      where: { firebaseUid },
      select: { email: true },
    });
    const config = mpConfig();
    const accessToken = await this.accounts.accessTokenFor(fee.clubId);
    const preference = await this.mp.createPreference(accessToken, {
      title:
        `Cuota ${MONTHS[fee.month - 1] ?? fee.month} ${fee.year} - ${fee.club.name}`.slice(
          0,
          250,
        ),
      amount,
      currency: 'ARS',
      externalReference: feeReference(fee.id),
      payerEmail: user?.email,
      notificationUrl: `${config.publicApiUrl}/payments/mercadopago/webhook?fee=${fee.id}`,
      backUrl: `${config.publicAppUrl}/dashboard/member/payments?cuota=${fee.id}`,
      // 48 h para completar el pago; después hay que generar otro link.
      expiresAt: new Date(Date.now() + 48 * 3_600_000),
      // El monto va en la clave: si el club corrige la cuota, no se reutiliza el link viejo.
      idempotencyKey: `pref-fee:${fee.id}:${amount}`,
    });
    await this.prisma.playerPayment.update({
      where: { id: fee.id },
      data: { mpPreferenceId: preference.id },
    });
    return {
      checkoutUrl: config.testMode
        ? (preference.sandbox_init_point ?? preference.init_point)
        : preference.init_point,
    };
  }

  /** Vuelta del checkout: el socio vuelve al portal y confirmamos sin esperar el webhook. */
  async syncForOwner(
    companyId: string,
    firebaseUid: string,
    feeId: string,
    paymentId: string,
  ) {
    if (!/^\d{1,20}$/.test(paymentId))
      throw new BadRequestException('Pago inválido');
    await this.loadForOwner(companyId, firebaseUid, feeId);
    await this.applyPayment(feeId, paymentId);
    const fee = await this.prisma.playerPayment.findUnique({
      where: { id: feeId },
      select: { status: true, paymentDate: true, mpPaymentStatus: true },
    });
    return fee;
  }

  /** Aplica el estado real de un pago a la cuota. Idempotente (webhook + vuelta). */
  async applyPayment(feeId: string, paymentId: string) {
    const fee = await this.prisma.playerPayment.findUnique({
      where: { id: feeId },
      include: { club: { select: { name: true } } },
    });
    if (!fee) throw new NotFoundException('Cuota no encontrada');

    const accessToken = await this.accounts.accessTokenFor(fee.clubId);
    const payment = await this.mp.getPayment(accessToken, paymentId);

    if (payment.external_reference !== feeReference(fee.id)) {
      this.logger.warn(`Pago ${paymentId} no corresponde a la cuota ${fee.id}`);
      throw new BadRequestException('El pago no corresponde a esta cuota');
    }

    if (payment.status !== 'approved') {
      // rechazado / en proceso / devuelto: solo se registra; la cuota sigue como está.
      await this.prisma.playerPayment.update({
        where: { id: fee.id },
        data: {
          mpPaymentStatus: payment.status,
          ...(fee.mpPaymentId ? {} : { mpPaymentId: String(payment.id) }),
        },
      });
      return;
    }

    const amountOk = payment.transaction_amount + 0.001 >= Number(fee.amount);
    if (!amountOk || payment.currency_id !== 'ARS') {
      // Cobrado pero no coincide (la cuota cambió después de generar el link):
      // no se marca paga sola; queda a la vista del club para revisarla.
      this.logger.error(
        `Pago ${payment.id} con monto/moneda distinto para la cuota ${fee.id}`,
      );
      await this.prisma.playerPayment.update({
        where: { id: fee.id },
        data: {
          mpPaymentId: String(payment.id),
          mpPaymentStatus: 'amount_mismatch',
        },
      });
      await this.recordInTreasury(fee, payment);
      return;
    }

    const updated = await this.prisma.playerPayment.updateMany({
      where: { id: fee.id, status: { not: 'paid' } },
      data: {
        status: 'paid',
        paymentMethod: 'mercadopago',
        paymentDate: payment.date_approved
          ? new Date(payment.date_approved)
          : new Date(),
        mpPaymentId: String(payment.id),
        mpPaymentStatus: 'approved',
      },
    });
    if (updated.count === 0 && fee.mpPaymentId !== String(payment.id)) {
      this.logger.warn(
        `Pago ${payment.id} sobre la cuota ${fee.id}, que ya estaba paga: revisar posible devolución`,
      );
    }
    await this.recordInTreasury(fee, payment);
  }

  /**
   * Cuota cobrada → ingreso en Tesorería y la comisión de Mercado Pago como gasto.
   * Idempotente: la referencia mp:<pago> es única en la base (igual que las señas).
   */
  private async recordInTreasury(
    fee: { companyId: string; clubId: string; month: number; year: number },
    payment: MpPayment,
  ) {
    const occurredAt = payment.date_approved
      ? new Date(payment.date_approved)
      : new Date();
    const label = `${MONTHS[fee.month - 1] ?? fee.month} ${fee.year}`;
    const mpFee = roundMoney(
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
            companyId: fee.companyId,
            clubId: fee.clubId,
            type: 'income',
            category: 'Cuotas sociales',
            amount: payment.transaction_amount,
            currency: payment.currency_id,
            occurredAt,
            description: `Cuota de socio ${label} (Mercado Pago)`,
            reference: `mp:${payment.id}`,
          },
          ...(mpFee > 0
            ? [
                {
                  companyId: fee.companyId,
                  clubId: fee.clubId,
                  type: 'expense' as const,
                  category: 'Comisión Mercado Pago',
                  amount: mpFee,
                  currency: payment.currency_id,
                  occurredAt,
                  description: `Comisión por la cuota ${label}`,
                  reference: `mp-fee:${payment.id}`,
                },
              ]
            : []),
        ],
      });
    } catch (error) {
      // Tesorería no debe frenar la confirmación de la cuota.
      this.logger.error(
        `No se registró en Tesorería el pago ${payment.id}: ${String(error)}`,
      );
    }
  }
}
