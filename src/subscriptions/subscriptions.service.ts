import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SubscriptionStatus } from '@prisma/client';

import { AuditService, type AuditActor } from '../platform/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlanDto,
  ListInvoicesDto,
  MarkInvoiceDto,
  UpdatePlanDto,
  UpsertSubscriptionDto,
} from './dto/subscription.dto';

const SUBSCRIPTION_SELECT = {
  id: true,
  clubId: true,
  planId: true,
  customPrice: true,
  status: true,
  billingDay: true,
  startedAt: true,
  trialEndsAt: true,
  suspendedAt: true,
  suspendedReason: true,
  cancelledAt: true,
  notes: true,
  plan: { select: { id: true, name: true, monthlyPrice: true } },
} satisfies Prisma.ClubSubscriptionSelect;

type SubscriptionRow = Prisma.ClubSubscriptionGetPayload<{
  select: typeof SUBSCRIPTION_SELECT;
}>;

const money = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

/** Precio que paga el club: el pactado o, si no hay, el del plan. */
export function effectivePrice(subscription: {
  customPrice: Prisma.Decimal | null;
  plan: { monthlyPrice: Prisma.Decimal };
}) {
  return Number(subscription.customPrice ?? subscription.plan.monthlyPrice);
}

/** Vencimiento de la mensualidad de un mes: el día de cobro de ese mes (UTC, 12 h). */
export function dueDateFor(period: string, billingDay: number) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, billingDay, 12));
}

/** Último instante del mes, para saber si la suscripción ya existía ese mes. */
function endOfPeriod(period: string) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1) - 1);
}

function serialize(subscription: SubscriptionRow) {
  return {
    ...subscription,
    customPrice: money(subscription.customPrice),
    price: effectivePrice(subscription),
    plan: {
      ...subscription.plan,
      monthlyPrice: Number(subscription.plan.monthlyPrice),
    },
  };
}

/**
 * Suscripciones de los clubes a Fluxion: planes, mensualidades y suspensión.
 * Todo cambio queda en la auditoría inmutable.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ----- Planes -----

  async listPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: [{ active: 'desc' }, { monthlyPrice: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans.map((plan) => ({
      ...plan,
      monthlyPrice: Number(plan.monthlyPrice),
      clubs: plan._count.subscriptions,
    }));
  }

  async createPlan(actor: AuditActor, dto: CreatePlanDto) {
    const plan = await this.prisma.subscriptionPlan.create({ data: dto });
    await this.audit.record(
      actor,
      'subscription.plan.create',
      { type: 'SubscriptionPlan', id: plan.id },
      { after: plan },
    );
    return { ...plan, monthlyPrice: Number(plan.monthlyPrice) };
  }

  async updatePlan(actor: AuditActor, id: string, dto: UpdatePlanDto) {
    const before = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('Plan no encontrado');
    const after = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: dto,
    });
    await this.audit.record(
      actor,
      'subscription.plan.update',
      { type: 'SubscriptionPlan', id },
      { before, after },
    );
    return { ...after, monthlyPrice: Number(after.monthlyPrice) };
  }

  // ----- Suscripciones -----

  /** Todos los clubes, con su suscripción (si tiene) y el estado de sus mensualidades. */
  async listClubs() {
    const now = new Date();
    const [clubs, pending] = await Promise.all([
      this.prisma.club.findMany({
        select: {
          id: true,
          name: true,
          city: true,
          company: { select: { name: true } },
          subscription: { select: SUBSCRIPTION_SELECT },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.subscriptionInvoice.findMany({
        where: { status: 'PENDING' },
        select: { clubId: true, amount: true, dueDate: true },
      }),
    ]);
    return clubs.map((club) => {
      const mine = pending.filter((invoice) => invoice.clubId === club.id);
      const overdue = mine.filter((invoice) => invoice.dueDate < now);
      return {
        id: club.id,
        name: club.name,
        city: club.city,
        company: club.company.name,
        subscription: club.subscription ? serialize(club.subscription) : null,
        pendingInvoices: mine.length,
        pendingAmount: mine.reduce(
          (sum, invoice) => sum + Number(invoice.amount),
          0,
        ),
        overdueInvoices: overdue.length,
        overdueAmount: overdue.reduce(
          (sum, invoice) => sum + Number(invoice.amount),
          0,
        ),
      };
    });
  }

  async upsert(actor: AuditActor, clubId: string, dto: UpsertSubscriptionDto) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, companyId: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan?.active) throw new BadRequestException('Elegí un plan activo.');

    const before = await this.prisma.clubSubscription.findUnique({
      where: { clubId },
      select: SUBSCRIPTION_SELECT,
    });
    if (
      before &&
      (before.status === 'SUSPENDED' || before.status === 'CANCELLED')
    )
      throw new ConflictException(
        'La suscripción está suspendida o dada de baja: reactivála primero.',
      );

    const data = {
      planId: dto.planId,
      customPrice: dto.customPrice,
      billingDay: dto.billingDay,
      status: dto.status,
      trialEndsAt:
        dto.trialEndsAt === undefined
          ? undefined
          : dto.trialEndsAt === null
            ? null
            : new Date(`${dto.trialEndsAt}T12:00:00Z`),
      notes: dto.notes,
    };
    const after = await this.prisma.clubSubscription.upsert({
      where: { clubId },
      create: { ...data, companyId: club.companyId, clubId },
      update: data,
      select: SUBSCRIPTION_SELECT,
    });
    await this.audit.record(
      actor,
      before ? 'subscription.update' : 'subscription.create',
      { type: 'ClubSubscription', id: after.id },
      { before: before && serialize(before), after: serialize(after) },
    );
    return serialize(after);
  }

  /** Suspender: la consola del club queda en solo lectura y el club sale de la app. */
  suspend(actor: AuditActor, clubId: string, reason: string) {
    return this.transition(actor, clubId, 'SUSPENDED', reason, [
      'TRIAL',
      'ACTIVE',
    ]);
  }

  reactivate(actor: AuditActor, clubId: string, reason: string) {
    return this.transition(actor, clubId, 'ACTIVE', reason, [
      'SUSPENDED',
      'CANCELLED',
    ]);
  }

  cancel(actor: AuditActor, clubId: string, reason: string) {
    return this.transition(actor, clubId, 'CANCELLED', reason, [
      'TRIAL',
      'ACTIVE',
      'SUSPENDED',
    ]);
  }

  // ----- Mensualidades -----

  /**
   * Genera las mensualidades de un mes para las suscripciones activas.
   * Idempotente: una por suscripción y mes (índice único); repetir no duplica.
   */
  async generateInvoices(actor: AuditActor, period: string) {
    const until = endOfPeriod(period);
    const subscriptions = await this.prisma.clubSubscription.findMany({
      where: { status: 'ACTIVE', startedAt: { lte: until } },
      select: { ...SUBSCRIPTION_SELECT, companyId: true },
    });
    const data = subscriptions
      .map((subscription) => ({
        subscriptionId: subscription.id,
        companyId: subscription.companyId,
        clubId: subscription.clubId,
        period,
        amount: effectivePrice(subscription),
        dueDate: dueDateFor(period, subscription.billingDay),
      }))
      .filter((invoice) => invoice.amount > 0);
    const result = await this.prisma.subscriptionInvoice.createMany({
      data,
      skipDuplicates: true,
    });
    await this.audit.record(
      actor,
      'subscription.invoices.generate',
      { type: 'SubscriptionInvoice', id: period },
      { after: { period, created: result.count, eligible: data.length } },
    );
    return {
      period,
      created: result.count,
      alreadyExisted: data.length - result.count,
    };
  }

  async listInvoices(query: ListInvoicesDto) {
    const now = new Date();
    const status =
      query.status === 'OVERDUE' ? 'PENDING' : (query.status ?? undefined);
    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: {
        ...(query.period && { period: query.period }),
        ...(query.clubId && { clubId: query.clubId }),
        ...(status && { status }),
        ...(query.status === 'OVERDUE' && { dueDate: { lt: now } }),
      },
      orderBy: [{ period: 'desc' }, { dueDate: 'asc' }],
      take: 1000,
      include: {
        club: { select: { id: true, name: true, city: true } },
        subscription: { select: { plan: { select: { name: true } } } },
      },
    });
    return invoices.map(({ subscription, ...invoice }) => ({
      ...invoice,
      amount: Number(invoice.amount),
      planName: subscription.plan.name,
      overdue: invoice.status === 'PENDING' && invoice.dueDate < now,
    }));
  }

  /** Cobrada, pendiente o anulada. Cobrada → gasto en la Tesorería del club. */
  async markInvoice(actor: AuditActor, id: string, dto: MarkInvoiceDto) {
    const before = await this.prisma.subscriptionInvoice.findUnique({
      where: { id },
      include: {
        subscription: { select: { plan: { select: { name: true } } } },
      },
    });
    if (!before) throw new NotFoundException('Mensualidad no encontrada');
    const after = await this.prisma.subscriptionInvoice.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt: dto.status === 'PAID' ? (before.paidAt ?? new Date()) : null,
        paymentMethod:
          dto.paymentMethod ??
          (dto.status === 'PAID' ? before.paymentMethod : null),
        paymentRef:
          dto.paymentRef ?? (dto.status === 'PAID' ? before.paymentRef : null),
        notes: dto.notes ?? before.notes,
      },
    });

    const reference = `fx-sub:${id}`;
    if (dto.status === 'PAID' && before.status !== 'PAID') {
      await this.prisma.financialTransaction.create({
        data: {
          companyId: before.companyId,
          clubId: before.clubId,
          type: 'expense',
          category: 'Fluxion · Suscripción',
          amount: before.amount,
          currency: before.currency,
          occurredAt: after.paidAt ?? new Date(),
          description: `Mensualidad ${before.period} · plan ${before.subscription.plan.name}`,
          reference,
        },
      });
    } else if (dto.status !== 'PAID' && before.status === 'PAID') {
      await this.prisma.financialTransaction.deleteMany({
        where: { reference },
      });
    }

    await this.audit.record(
      actor,
      `subscription.invoice.${dto.status.toLowerCase()}`,
      { type: 'SubscriptionInvoice', id },
      {
        before: { status: before.status, paidAt: before.paidAt },
        after: {
          status: after.status,
          paidAt: after.paidAt,
          paymentMethod: after.paymentMethod,
          paymentRef: after.paymentRef,
        },
      },
    );
    return { ...after, amount: Number(after.amount) };
  }

  // ----- Consola del club -----

  /** Lo que ve el club de su propia suscripción (para el aviso en la consola). */
  async forClub(clubId: string) {
    const now = new Date();
    const [subscription, pending] = await Promise.all([
      this.prisma.clubSubscription.findUnique({
        where: { clubId },
        select: SUBSCRIPTION_SELECT,
      }),
      this.prisma.subscriptionInvoice.findMany({
        where: { clubId, status: 'PENDING' },
        orderBy: { dueDate: 'asc' },
        select: { id: true, period: true, amount: true, dueDate: true },
      }),
    ]);
    if (!subscription) return { subscription: null, pending: [] };
    return {
      subscription: {
        status: subscription.status,
        planName: subscription.plan.name,
        price: effectivePrice(subscription),
        billingDay: subscription.billingDay,
        trialEndsAt: subscription.trialEndsAt,
        suspendedReason: subscription.suspendedReason,
      },
      pending: pending.map((invoice) => ({
        ...invoice,
        amount: Number(invoice.amount),
        overdue: invoice.dueDate < now,
      })),
    };
  }

  // ----- helpers -----

  private async transition(
    actor: AuditActor,
    clubId: string,
    status: SubscriptionStatus,
    reason: string,
    from: SubscriptionStatus[],
  ) {
    const before = await this.prisma.clubSubscription.findUnique({
      where: { clubId },
      select: SUBSCRIPTION_SELECT,
    });
    if (!before)
      throw new NotFoundException(
        'El club todavía no tiene una suscripción cargada.',
      );
    if (!from.includes(before.status))
      throw new ConflictException(
        `La suscripción ya está en estado ${before.status}.`,
      );
    const after = await this.prisma.clubSubscription.update({
      where: { clubId },
      data: {
        status,
        ...(status === 'SUSPENDED' && {
          suspendedAt: new Date(),
          suspendedReason: reason,
        }),
        ...(status === 'CANCELLED' && {
          cancelledAt: new Date(),
          suspendedReason: reason,
        }),
        ...(status === 'ACTIVE' && {
          suspendedAt: null,
          suspendedReason: null,
          cancelledAt: null,
        }),
      },
      select: SUBSCRIPTION_SELECT,
    });
    await this.audit.record(
      actor,
      `subscription.${status === 'ACTIVE' ? 'reactivate' : status.toLowerCase()}`,
      { type: 'ClubSubscription', id: after.id },
      { before: serialize(before), after: serialize(after), reason },
    );
    return serialize(after);
  }
}
