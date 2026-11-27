import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

import { EmailNotificationsService } from '../email/email-notifications.service';
import { InvoicingService } from '../invoicing/invoicing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerPaymentDto } from './dto/create-player-payment.dto';
import { UpdatePlayerPaymentDto } from './dto/update-player-payment.dto';
import {
  LATE_FEE_CLUB_SELECT,
  computeLateFee,
  lateFeeConfigOf,
} from './late-fee';
import {
  feeReference,
  feeTreasuryEntry,
  type FeeForTreasury,
} from './fee-treasury';

/** El vencimiento se guarda al mediodía UTC para que no cambie de día según la zona horaria. */
export function toDueDate(value?: string): Date | undefined {
  return value ? new Date(`${value}T12:00:00.000Z`) : undefined;
}

@Injectable()
export class PlayerPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emails?: EmailNotificationsService,
    @Optional() private readonly invoicing?: InvoicingService,
  ) {}

  async list(
    companyId: string,
    filters?: {
      clubId?: string;
      playerId?: string;
      skip?: number;
      take?: number;
      withMeta?: boolean;
    },
  ) {
    const where = {
      companyId,
      ...(filters?.clubId ? { clubId: filters.clubId } : {}),
      ...(filters?.playerId ? { playerId: filters.playerId } : {}),
    };

    const baseQuery = {
      where,
      include: {
        club: { select: { id: true, name: true } },
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            clubId: true,
            teamId: true,
            active: true,
          },
        },
      },
      orderBy: [
        { year: 'desc' as const },
        { month: 'desc' as const },
        { createdAt: 'desc' as const },
      ],
      skip: filters?.skip,
      take: filters?.take,
    };

    if (!filters?.withMeta) {
      return this.withLateFee(
        await this.prisma.playerPayment.findMany(baseQuery),
      );
    }

    const [rows, total] = await Promise.all([
      this.prisma.playerPayment.findMany(baseQuery),
      this.prisma.playerPayment.count({ where }),
    ]);

    const items = await this.withLateFee(rows);
    const offset = filters?.skip ?? 0;
    const limit = filters?.take ?? null;
    const hasMore = filters?.take ? offset + items.length < total : false;

    return {
      items,
      meta: {
        total,
        offset,
        limit,
        hasMore,
      },
    };
  }

  /** Agrega `lateFee` (intereses de hoy) a las cuotas sin cobrar, según la configuración de su club. */
  async withLateFee<
    T extends {
      clubId: string;
      amount: unknown;
      month: number;
      year: number;
      dueDate?: Date | null;
      status: string;
    },
  >(rows: T[]) {
    const clubIds = [
      ...new Set(rows.filter((r) => r.status !== 'paid').map((r) => r.clubId)),
    ];
    const clubs = clubIds.length
      ? await this.prisma.club.findMany({
          where: { id: { in: clubIds } },
          select: { id: true, ...LATE_FEE_CLUB_SELECT },
        })
      : [];
    const byClub = new Map(clubs.map((c) => [c.id, c]));
    return rows.map((r) => {
      const club = byClub.get(r.clubId);
      if (r.status === 'paid' || !club) return { ...r, lateFee: null };
      const lf = computeLateFee(
        {
          amount: Number(r.amount),
          month: r.month,
          year: r.year,
          dueDate: r.dueDate,
        },
        lateFeeConfigOf(club),
        new Date(),
        club.timezone,
      );
      return { ...r, lateFee: lf.amount > 0 ? lf : null };
    });
  }

  async getById(companyId: string, id: string) {
    const payment = await this.prisma.playerPayment.findFirst({
      where: { companyId, id },
      include: {
        club: true,
        player: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Player payment not found');
    }

    return payment;
  }

  async create(companyId: string, dto: CreatePlayerPaymentDto) {
    await this.ensurePlayer(companyId, dto.playerId, dto.clubId);

    const paymentDate = dto.status === 'paid' ? new Date() : null;

    const created = await this.prisma.playerPayment.create({
      data: {
        companyId,
        clubId: dto.clubId,
        playerId: dto.playerId,
        month: dto.month,
        year: dto.year,
        amount: dto.amount,
        status: dto.status ?? PaymentStatus.paid,
        paymentMethod: dto.paymentMethod,
        paymentDate,
        dueDate: toDueDate(dto.dueDate),
      },
      include: {
        club: true,
        player: true,
      },
    });
    await this.syncTreasury(created);
    if (created.status === PaymentStatus.paid) {
      void this.emails?.notifyReceipt(created.id);
      void this.invoicing?.issueForPayment(created.id);
    }
    return created;
  }

  async update(companyId: string, id: string, dto: UpdatePlayerPaymentDto) {
    const current = await this.getById(companyId, id);
    const nextStatus = dto.status;
    const paymentDate = nextStatus
      ? nextStatus === PaymentStatus.paid
        ? dto.paymentDate
          ? new Date(`${dto.paymentDate}T12:00:00.000Z`)
          : (current.paymentDate ?? new Date())
        : null
      : undefined;

    const updated = await this.prisma.playerPayment.update({
      where: { id },
      data: {
        month: dto.month,
        year: dto.year,
        amount: dto.amount,
        status: nextStatus,
        paymentMethod: dto.paymentMethod,
        paymentDate,
        dueDate: toDueDate(dto.dueDate),
        // Los intereses solo valen en una cuota cobrada; al volver a pendiente se limpian.
        lateFeeAmount:
          nextStatus === PaymentStatus.paid
            ? dto.lateFeeAmount
            : nextStatus
              ? null
              : undefined,
      },
      include: {
        club: true,
        player: true,
      },
    });
    await this.syncTreasury(updated);
    if (
      nextStatus === PaymentStatus.paid &&
      current.status !== PaymentStatus.paid
    ) {
      void this.emails?.notifyReceipt(updated.id);
      void this.invoicing?.issueForPayment(updated.id);
    }
    return updated;
  }

  /**
   * Deja la caja igual que la cuota: cobrada → un ingreso fee:<id> (con el monto
   * y la fecha actuales); pendiente o anulada → sin ingreso.
   */
  private async syncTreasury(fee: FeeForTreasury) {
    const reference = feeReference(fee.id);
    const entry = feeTreasuryEntry(fee);
    if (!entry) {
      await this.prisma.financialTransaction.deleteMany({
        where: { companyId: fee.companyId, reference },
      });
      return;
    }
    const existing = await this.prisma.financialTransaction.findFirst({
      where: { companyId: fee.companyId, reference },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.financialTransaction.update({
        where: { id: existing.id },
        data: {
          amount: entry.amount,
          occurredAt: entry.occurredAt,
          description: entry.description,
        },
      });
      return;
    }
    await this.prisma.financialTransaction.createMany({
      data: [entry],
      skipDuplicates: true,
    });
  }

  private async ensurePlayer(
    companyId: string,
    playerId: string,
    clubId: string,
  ) {
    const player = await this.prisma.player.findFirst({
      where: { companyId, id: playerId, clubId },
      select: { id: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }
  }
}
