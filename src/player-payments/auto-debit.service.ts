import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  AUTO_DEBIT_METHOD_LABEL,
  autoDebitOf,
  looksLikeAccountNumber,
} from './auto-debit';
import type { AutoDebitKind } from './auto-debit';
import { PlayerPaymentsService } from './player-payments.service';

@Injectable()
export class AutoDebitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PlayerPaymentsService,
  ) {}

  /** Atletas adheridos y el estado de su cuota del mes (para registrar los débitos). */
  async list(companyId: string, clubId: string, month: number, year: number) {
    const players = await this.prisma.player.findMany({
      where: { companyId, clubId, autoDebit: { path: ['active'], equals: true } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, autoDebit: true },
    });
    const fees = players.length
      ? await this.prisma.playerPayment.findMany({
          where: { clubId, month, year, playerId: { in: players.map((p) => p.id) } },
          select: { id: true, playerId: true, status: true, amount: true, paymentDate: true },
        })
      : [];
    const byPlayer = new Map(fees.map((f) => [f.playerId, f]));
    return players.map((p) => {
      const fee = byPlayer.get(p.id);
      const ad = autoDebitOf(p.autoDebit);
      return {
        playerId: p.id,
        name: `${p.lastName}, ${p.firstName}`,
        method: ad?.method ?? 'cbu',
        label: ad?.label ?? null,
        since: ad?.since ?? null,
        fee: fee
          ? {
              id: fee.id,
              status: fee.status,
              amount: Number(fee.amount),
              paymentDate: fee.paymentDate?.toISOString() ?? null,
            }
          : null,
      };
    });
  }

  /** Adherir o dar de baja el débito automático de un atleta. */
  async set(
    companyId: string,
    clubId: string,
    playerId: string,
    byUid: string | undefined,
    input: { active: boolean; method?: AutoDebitKind; label?: string },
  ) {
    const player = await this.prisma.player.findFirst({
      where: { id: playerId, companyId, clubId },
      select: { id: true },
    });
    if (!player) throw new NotFoundException('Atleta no encontrado');
    const label = input.label?.trim() || null;
    if (label && looksLikeAccountNumber(label))
      throw new BadRequestException(
        'No cargues el número de cuenta ni de tarjeta: alcanza con el banco o los últimos 4 dígitos.',
      );
    await this.prisma.player.update({
      where: { id: playerId },
      data: {
        autoDebit: input.active
          ? ({
              active: true,
              method: input.method ?? 'cbu',
              label,
              since: new Date().toISOString().slice(0, 10),
              by: byUid ?? null,
            } as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
    return { ok: true };
  }

  /**
   * El banco ya debitó: registra el abono de la cuota del mes de los atletas elegidos
   * (queda en Tesorería como "Débito automático", con recibo si corresponde).
   */
  async collect(
    companyId: string,
    clubId: string,
    input: { month: number; year: number; paymentDate: string; playerIds: string[] },
  ) {
    const rows = await this.list(companyId, clubId, input.month, input.year);
    const chosen = new Set(input.playerIds);
    let paid = 0;
    const skipped: { playerId: string; reason: string }[] = [];
    for (const id of chosen) {
      const row = rows.find((r) => r.playerId === id);
      if (!row) skipped.push({ playerId: id, reason: 'No está adherido al débito automático' });
      else if (!row.fee) skipped.push({ playerId: id, reason: 'No tiene cuota ese mes' });
      else if (row.fee.status === 'paid') skipped.push({ playerId: id, reason: 'La cuota ya estaba cobrada' });
      else {
        await this.payments.update(companyId, row.fee.id, {
          status: 'paid',
          paymentMethod: AUTO_DEBIT_METHOD_LABEL,
          paymentDate: input.paymentDate,
        } as never);
        paid += 1;
      }
    }
    return { paid, skipped };
  }
}
