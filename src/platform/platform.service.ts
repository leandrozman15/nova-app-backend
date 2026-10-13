import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  ListChargesDto,
  MarkChargesDto,
  UpdatePlatformSettingsDto,
} from './dto/platform.dto';

const SETTINGS_ID = 'global';

type ChargeSource = {
  companyId: string;
  clubId: string;
  tournamentId: string;
  tournamentName: string;
};

/**
 * Lo que Fluxion le cobra a los clubes. Cada cargo se genera una sola vez por
 * origen (sourceKey único) con el valor vigente en ese momento, y queda como
 * gasto en la Tesorería del club.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const settings = await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
    return {
      tournamentPublishFee: Number(settings.tournamentPublishFee),
      tournamentEntryFee: Number(settings.tournamentEntryFee),
      currency: settings.currency,
      updatedAt: settings.updatedAt,
    };
  }

  async updateSettings(uid: string, dto: UpdatePlatformSettingsDto) {
    await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...dto, updatedByUid: uid },
      update: { ...dto, updatedByUid: uid },
    });
    return this.getSettings();
  }

  async listCharges(query: ListChargesDto) {
    const charges = await this.prisma.platformCharge.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.clubId && { clubId: query.clubId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        kind: true,
        amount: true,
        currency: true,
        description: true,
        status: true,
        paidAt: true,
        createdAt: true,
        tournamentId: true,
        club: { select: { id: true, name: true, city: true } },
      },
    });
    return charges.map((charge) => ({
      ...charge,
      amount: Number(charge.amount),
    }));
  }

  async markCharges(dto: MarkChargesDto) {
    const result = await this.prisma.platformCharge.updateMany({
      where: { id: { in: dto.ids } },
      data: {
        status: dto.status,
        paidAt: dto.status === 'PAID' ? new Date() : null,
      },
    });
    return { updated: result.count };
  }

  /** Cargos del club (para mostrarle cuánto le factura Fluxion). */
  async listClubCharges(clubId: string) {
    const charges = await this.prisma.platformCharge.findMany({
      where: { clubId, status: { not: 'VOIDED' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        kind: true,
        amount: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });
    return charges.map((charge) => ({
      ...charge,
      amount: Number(charge.amount),
    }));
  }

  /** Al publicar un torneo por primera vez. */
  chargeTournamentPublished(source: ChargeSource) {
    return this.charge(source, {
      kind: 'tournament_published',
      sourceKey: `tournament:${source.tournamentId}`,
      fee: 'tournamentPublishFee',
      description: `Publicación del torneo "${source.tournamentName}"`,
    });
  }

  /** Al confirmar una inscripción. */
  chargeEntryAccepted(
    source: ChargeSource & { entryId: string; entryName: string },
  ) {
    return this.charge(source, {
      kind: 'tournament_entry',
      sourceKey: `entry:${source.entryId}`,
      fee: 'tournamentEntryFee',
      description: `Inscripción confirmada "${source.entryName}" · ${source.tournamentName}`,
    });
  }

  /** Si se deshace la confirmación y todavía no se pagó, el cargo se anula. */
  async voidEntryCharge(entryId: string) {
    const charge = await this.prisma.platformCharge.findUnique({
      where: { sourceKey: `entry:${entryId}` },
      select: { id: true, status: true },
    });
    if (!charge || charge.status !== 'PENDING') return;
    await this.prisma.platformCharge.update({
      where: { id: charge.id },
      data: { status: 'VOIDED' },
    });
    await this.prisma.financialTransaction.deleteMany({
      where: { reference: `fx:${charge.id}` },
    });
  }

  private async charge(
    source: ChargeSource,
    options: {
      kind: string;
      sourceKey: string;
      fee: 'tournamentPublishFee' | 'tournamentEntryFee';
      description: string;
    },
  ) {
    const settings = await this.getSettings();
    const amount = settings[options.fee];
    if (!(amount > 0)) return null;

    const existing = await this.prisma.platformCharge.findUnique({
      where: { sourceKey: options.sourceKey },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== 'VOIDED') return existing;

    try {
      const charge = existing
        ? await this.prisma.platformCharge.update({
            where: { id: existing.id },
            data: { status: 'PENDING', amount, paidAt: null },
          })
        : await this.prisma.platformCharge.create({
            data: {
              companyId: source.companyId,
              clubId: source.clubId,
              tournamentId: source.tournamentId,
              kind: options.kind,
              sourceKey: options.sourceKey,
              amount,
              currency: settings.currency,
              description: options.description,
            },
          });
      await this.prisma.financialTransaction.create({
        data: {
          companyId: source.companyId,
          clubId: source.clubId,
          type: 'expense',
          category: 'Fluxion · Torneos',
          amount,
          currency: settings.currency,
          occurredAt: new Date(),
          description: options.description,
          reference: `fx:${charge.id}`,
        },
      });
      return charge;
    } catch (error) {
      // Dos pedidos simultáneos: el índice único deja pasar solo uno.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return null;
      this.logger.error(
        `No se pudo registrar el cargo ${options.sourceKey}: ${String(error)}`,
      );
      throw error;
    }
  }
}
