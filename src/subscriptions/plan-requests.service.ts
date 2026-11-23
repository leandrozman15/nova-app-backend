import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PlanRequestKind } from '@prisma/client';

import { AuditService, type AuditActor } from '../platform/audit.service';
import { paymentOf } from '../platform/platform.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanRequestDto, ResolvePlanRequestDto } from './dto/plan-request.dto';
import { SubscriptionsService, termsOf } from './subscriptions.service';

const REQUEST_SELECT = {
  id: true,
  clubId: true,
  kind: true,
  status: true,
  extraBlocks: true,
  invoiceId: true,
  amount: true,
  reference: true,
  note: true,
  createdByName: true,
  createdAt: true,
  resolvedAt: true,
  response: true,
} satisfies Prisma.PlanRequestSelect;

type RequestRow = Prisma.PlanRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

const out = (r: RequestRow) => ({
  ...r,
  amount: r.amount === null ? null : Number(r.amount),
});

/** Pedidos que no tiene sentido repetir mientras uno igual espera respuesta. */
const ONE_AT_A_TIME: PlanRequestKind[] = [
  'ACTIVATION',
  'EXTRA_USERS',
  'INTEGRATIONS',
  'BUFFET',
];

/**
 * "Mi plan" del club: estado de la suscripción, datos para transferir a Fluxion
 * y pedidos (más usuarios, packs, alta del plan, aviso de pago) que resuelve Fluxion.
 */
@Injectable()
export class PlanRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
  ) {}

  // ----- Consola del club -----

  async myPlan(clubId: string) {
    const [state, settings, offer, requests] = await Promise.all([
      this.subscriptions.forClub(clubId),
      this.prisma.platformSettings.findUnique({ where: { id: 'global' } }),
      this.offerFor(clubId),
      this.prisma.planRequest.findMany({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: REQUEST_SELECT,
      }),
    ]);
    const activeAthletes =
      state.subscription?.activeAthletes ??
      (await this.prisma.player.count({ where: { clubId, active: true } }));
    return {
      ...state,
      // Sin suscripción cargada: club piloto, todo habilitado y sin cupo.
      pilot: !state.subscription,
      activeAthletes,
      offer,
      payment: settings ? paymentOf(settings) : paymentOf({
        paymentAlias: null,
        paymentCbu: null,
        paymentHolder: null,
        paymentBank: null,
        paymentCuit: null,
        paymentNote: null,
      }),
      requests: requests.map(out),
    };
  }

  async request(
    clubId: string,
    companyId: string,
    actor: { uid: string; name?: string | null },
    dto: PlanRequestDto,
  ) {
    const subscription = await this.prisma.clubSubscription.findUnique({
      where: { clubId },
      select: { id: true, status: true },
    });
    if (dto.kind === 'ACTIVATION' && subscription && subscription.status !== 'CANCELLED')
      throw new BadRequestException('El club ya tiene un plan.');
    if (['EXTRA_USERS', 'INTEGRATIONS', 'BUFFET'].includes(dto.kind) && !subscription)
      throw new BadRequestException(
        'Tu club está en plan piloto: tiene todo habilitado. Pedí el alta del plan cuando quieras contratarlo.',
      );
    if (dto.kind === 'EXTRA_USERS' && !dto.extraBlocks)
      throw new BadRequestException('Indicá cuántos bloques de usuarios querés sumar.');

    let amount: number | null = null;
    if (dto.kind === 'PAYMENT') {
      if (!dto.invoiceId && !dto.amount)
        throw new BadRequestException('Indicá qué mensualidad pagaste o el monto.');
      if (dto.invoiceId) {
        const invoice = await this.prisma.subscriptionInvoice.findFirst({
          where: { id: dto.invoiceId, clubId },
          select: { amount: true, status: true },
        });
        if (!invoice) throw new NotFoundException('Mensualidad no encontrada');
        if (invoice.status !== 'PENDING')
          throw new ConflictException('Esa mensualidad ya figura como pagada.');
        amount = dto.amount ?? Number(invoice.amount);
      } else amount = dto.amount ?? null;
    }

    if (ONE_AT_A_TIME.includes(dto.kind)) {
      const open = await this.prisma.planRequest.count({
        where: { clubId, kind: dto.kind, status: 'PENDING' },
      });
      if (open)
        throw new ConflictException('Ya hay un pedido igual esperando respuesta de Fluxion.');
    }
    if (dto.kind === 'PAYMENT' && dto.invoiceId) {
      const open = await this.prisma.planRequest.count({
        where: { clubId, kind: 'PAYMENT', invoiceId: dto.invoiceId, status: 'PENDING' },
      });
      if (open)
        throw new ConflictException('Ya avisaste el pago de esa mensualidad: lo estamos revisando.');
    }

    const created = await this.prisma.planRequest.create({
      data: {
        companyId,
        clubId,
        kind: dto.kind,
        extraBlocks: dto.kind === 'EXTRA_USERS' ? dto.extraBlocks : null,
        invoiceId: dto.kind === 'PAYMENT' ? (dto.invoiceId ?? null) : null,
        amount,
        reference: dto.reference || null,
        note: dto.note || null,
        createdByUid: actor.uid,
        createdByName: actor.name ?? null,
      },
      select: REQUEST_SELECT,
    });
    return out(created);
  }

  // ----- Panel de Fluxion -----

  async list(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const rows = await this.prisma.planRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { ...REQUEST_SELECT, club: { select: { name: true } } },
    });
    return rows.map(({ club, ...r }) => ({ ...out(r), clubName: club.name }));
  }

  /** Aprobar aplica el pedido (bloques, packs, reactivación o mensualidad pagada); queda auditado. */
  async resolve(actor: AuditActor, id: string, dto: ResolvePlanRequestDto) {
    const request = await this.prisma.planRequest.findUnique({
      where: { id },
      select: { ...REQUEST_SELECT, companyId: true },
    });
    if (!request) throw new NotFoundException('Pedido no encontrado');
    if (request.status !== 'PENDING')
      throw new ConflictException('Ese pedido ya fue resuelto.');

    let applied: string | null = null;
    if (dto.approve) applied = await this.apply(actor, request);

    const updated = await this.prisma.planRequest.update({
      where: { id },
      data: {
        status: dto.approve ? 'APPROVED' : 'REJECTED',
        resolvedAt: new Date(),
        resolvedByUid: actor.uid,
        response: dto.response || null,
      },
      select: REQUEST_SELECT,
    });
    await this.audit.record(
      actor,
      dto.approve ? 'plan_request.approve' : 'plan_request.reject',
      { type: 'PlanRequest', id },
      {
        before: { status: request.status, kind: request.kind },
        after: { status: updated.status, applied },
        reason: dto.response,
      },
    );
    return { ...out(updated), applied };
  }

  private async apply(
    actor: AuditActor,
    request: RequestRow & { companyId: string },
  ): Promise<string | null> {
    const { clubId } = request;
    switch (request.kind) {
      case 'EXTRA_USERS':
        await this.prisma.clubSubscription.update({
          where: { clubId },
          data: { extraBlocks: { increment: request.extraBlocks ?? 0 } },
        });
        return `+${request.extraBlocks ?? 0} bloques de usuarios`;
      case 'INTEGRATIONS':
        await this.prisma.clubSubscription.update({
          where: { clubId },
          data: { integrationsPack: true },
        });
        return 'Pack Integraciones activado';
      case 'BUFFET':
        await this.prisma.clubSubscription.update({
          where: { clubId },
          data: { buffetPack: true },
        });
        return 'Pack Buffet activado';
      case 'PAYMENT': {
        if (request.invoiceId)
          await this.subscriptions.markInvoice(actor, request.invoiceId, {
            status: 'PAID',
            paymentMethod: 'transferencia',
            paymentRef: request.reference ?? undefined,
          });
        // Si estaba suspendido por falta de pago y ya no debe nada, se reactiva.
        const sub = await this.prisma.clubSubscription.findUnique({
          where: { clubId },
          select: { status: true },
        });
        const owed = await this.prisma.subscriptionInvoice.count({
          where: { clubId, status: 'PENDING', dueDate: { lt: new Date() } },
        });
        if (sub?.status === 'SUSPENDED' && !owed) {
          await this.subscriptions.reactivate(actor, clubId, 'Pago informado y confirmado');
          return 'Mensualidad pagada y club reactivado';
        }
        return request.invoiceId ? 'Mensualidad marcada como pagada' : null;
      }
      case 'ACTIVATION': {
        const sub = await this.prisma.clubSubscription.findUnique({
          where: { clubId },
          select: { status: true },
        });
        if (sub?.status === 'CANCELLED') {
          await this.subscriptions.reactivate(actor, clubId, 'Alta pedida por el club');
          return 'Plan reactivado';
        }
        // Un club piloto se da de alta desde Suscripciones (plan, precio y día de cobro).
        return sub ? null : 'Falta cargar la suscripción del club en Suscripciones';
      }
      default:
        return null;
    }
  }

  /** Precios que se le muestran al club para pedir (los de su plan o los del plan vigente). */
  private async offerFor(clubId: string) {
    const sub = await this.prisma.clubSubscription.findUnique({
      where: { clubId },
      select: {
        customPrice: true,
        plan: {
          select: {
            name: true,
            monthlyPrice: true,
            includedAthletes: true,
            extraBlockSize: true,
            extraBlockPrice: true,
            buffetPackPrice: true,
            integrationsPackPrice: true,
          },
        },
      },
    });
    const plan =
      sub?.plan ??
      (await this.prisma.subscriptionPlan.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: {
          name: true,
          monthlyPrice: true,
          includedAthletes: true,
          extraBlockSize: true,
          extraBlockPrice: true,
          buffetPackPrice: true,
          integrationsPackPrice: true,
        },
      }));
    if (!plan) return null;
    const t = termsOf({ customPrice: null, plan });
    return { name: plan.name, ...t.plan };
  }
}
