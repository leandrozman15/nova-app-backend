import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerPaymentDto } from './dto/create-player-payment.dto';
import { UpdatePlayerPaymentDto } from './dto/update-player-payment.dto';

@Injectable()
export class PlayerPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, filters?: { clubId?: string; playerId?: string }) {
    return this.prisma.playerPayment.findMany({
      where: {
        companyId,
        ...(filters?.clubId ? { clubId: filters.clubId } : {}),
        ...(filters?.playerId ? { playerId: filters.playerId } : {}),
      },
      include: {
        club: true,
        player: true,
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
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

    return this.prisma.playerPayment.create({
      data: {
        companyId,
        clubId: dto.clubId,
        playerId: dto.playerId,
        month: dto.month,
        year: dto.year,
        amount: dto.amount,
        status: (dto.status as PaymentStatus | undefined) ?? PaymentStatus.paid,
        paymentMethod: dto.paymentMethod,
        paymentDate,
      },
      include: {
        club: true,
        player: true,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdatePlayerPaymentDto) {
    const current = await this.getById(companyId, id);
    const nextStatus = dto.status as PaymentStatus | undefined;
    const paymentDate = nextStatus
      ? nextStatus === PaymentStatus.paid
        ? current.paymentDate ?? new Date()
        : null
      : undefined;

    return this.prisma.playerPayment.update({
      where: { id },
      data: {
        month: dto.month,
        year: dto.year,
        amount: dto.amount,
        status: nextStatus,
        paymentMethod: dto.paymentMethod,
        paymentDate,
      },
      include: {
        club: true,
        player: true,
      },
    });
  }

  private async ensurePlayer(companyId: string, playerId: string, clubId: string) {
    const player = await this.prisma.player.findFirst({
      where: { companyId, id: playerId, clubId },
      select: { id: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }
  }
}