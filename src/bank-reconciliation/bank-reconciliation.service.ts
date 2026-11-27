import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  LATE_FEE_CLUB_SELECT,
  computeLateFee,
  lateFeeConfigOf,
} from '../player-payments/late-fee';
import { PlayerPaymentsService } from '../player-payments/player-payments.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ImportStatementDto } from './dto/bank-reconciliation.dto';
import {
  type FeeCandidate,
  movementHashes,
  suggestFees,
} from './reconciliation.logic';

const MONTHS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

type Status = 'pending' | 'matched' | 'recorded' | 'ignored';

@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PlayerPaymentsService,
  ) {}

  private async club(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true, ...LATE_FEE_CLUB_SELECT },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    return club;
  }

  private async movement(companyId: string, clubId: string, id: string) {
    const m = await this.prisma.bankMovement.findFirst({
      where: { id, companyId, clubId },
    });
    if (!m) throw new NotFoundException('Movimiento no encontrado');
    return m;
  }

  /** Guarda los renglones del extracto; los que ya se habían importado se saltean. */
  async importStatement(
    companyId: string,
    clubId: string,
    uid: string | undefined,
    dto: ImportStatementDto,
  ) {
    await this.club(companyId, clubId);
    const hashes = movementHashes(dto.rows);
    const rows = dto.rows
      .map((r, i) => ({ r, hash: hashes[i] }))
      .filter(({ r }) => r.amount !== 0);
    if (rows.length === 0)
      throw new BadRequestException(
        'El archivo no tiene movimientos con importe',
      );
    const existing = new Set(
      (
        await this.prisma.bankMovement.findMany({
          where: { clubId, hash: { in: rows.map((x) => x.hash) } },
          select: { hash: true },
        })
      ).map((m) => m.hash),
    );
    const fresh = rows.filter((x) => !existing.has(x.hash));
    const statement = await this.prisma.bankStatement.create({
      data: {
        companyId,
        clubId,
        fileName: dto.fileName.slice(0, 200),
        rowCount: fresh.length,
        importedBy: uid ?? null,
      },
    });
    if (fresh.length > 0) {
      await this.prisma.bankMovement.createMany({
        data: fresh.map(({ r, hash }) => ({
          companyId,
          clubId,
          statementId: statement.id,
          hash,
          date: new Date(`${r.date}T00:00:00.000Z`),
          description: r.description.trim() || 'Sin concepto',
          reference: r.reference?.trim() || null,
          amount: r.amount,
        })),
        skipDuplicates: true,
      });
    }
    return {
      statementId: statement.id,
      imported: fresh.length,
      duplicates: rows.length - fresh.length,
    };
  }

  async summary(companyId: string, clubId: string) {
    await this.club(companyId, clubId);
    const groups = await this.prisma.bankMovement.groupBy({
      by: ['status'],
      where: { companyId, clubId },
      _count: { _all: true },
    });
    const count = (s: Status) =>
      groups.find((g) => g.status === s)?._count._all ?? 0;
    return {
      pending: count('pending'),
      matched: count('matched'),
      recorded: count('recorded'),
      ignored: count('ignored'),
    };
  }

  /** Movimientos de un estado; los pendientes traen las cuotas sugeridas. */
  async list(companyId: string, clubId: string, status: Status, limit = 200) {
    const club = await this.club(companyId, clubId);
    const rows = await this.prisma.bankMovement.findMany({
      where: { companyId, clubId, status },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(limit, 1), 500),
    });
    let candidates: Array<{
      fee: {
        id: string;
        amount: unknown;
        month: number;
        year: number;
        dueDate: Date | null;
      };
      player: { firstName: string; lastName: string; extra: unknown };
    }> = [];
    if (status === 'pending' && rows.some((r) => Number(r.amount) > 0)) {
      const fees = await this.prisma.playerPayment.findMany({
        where: { companyId, clubId, status: { not: 'paid' } },
        select: {
          id: true,
          amount: true,
          month: true,
          year: true,
          dueDate: true,
          player: { select: { firstName: true, lastName: true, extra: true } },
        },
        take: 5000,
      });
      candidates = fees.map(({ player, ...fee }) => ({ fee, player }));
    }
    const config = lateFeeConfigOf(club);
    const feeInfo = new Map(
      candidates.map((c) => [
        c.fee.id,
        {
          id: c.fee.id,
          playerName: `${c.player.lastName}, ${c.player.firstName}`,
          period: `${MONTHS[c.fee.month - 1] ?? c.fee.month} ${c.fee.year}`,
          amount: Number(c.fee.amount),
        },
      ]),
    );
    return rows.map((m) => {
      const amount = Number(m.amount);
      let suggestions: Array<
        ReturnType<typeof suggestFees>[number] & {
          playerName: string;
          period: string;
          feeAmount: number;
        }
      > = [];
      if (status === 'pending' && amount > 0) {
        const at = new Date(`${dayStr(m.date)}T15:00:00.000Z`);
        const cands: FeeCandidate[] = candidates.map(({ fee, player }) => {
          const base = Number(fee.amount);
          const lf = computeLateFee(
            {
              amount: base,
              month: fee.month,
              year: fee.year,
              dueDate: fee.dueDate,
            },
            config,
            at,
            club.timezone,
          );
          const extra = (player.extra ?? {}) as Record<string, unknown>;
          const payerNames = [
            extra.emergencyContact,
            extra.guardianName,
          ].filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          );
          return {
            id: fee.id,
            amount: base,
            amountWithLateFee: lf.total,
            month: fee.month,
            year: fee.year,
            playerName: { first: player.firstName, last: player.lastName },
            payerNames,
          };
        });
        suggestions = suggestFees(
          { description: m.description, amount, date: dayStr(m.date) },
          cands,
        ).map((s) => {
          const info = feeInfo.get(s.feeId)!;
          return {
            ...s,
            playerName: info.playerName,
            period: info.period,
            feeAmount: info.amount,
          };
        });
      }
      return {
        id: m.id,
        date: dayStr(m.date),
        description: m.description,
        reference: m.reference,
        amount,
        status: m.status,
        matchedFeeId: m.matchedFeeId,
        transactionId: m.transactionId,
        note: m.note,
        suggestions,
      };
    });
  }

  /** Confirma que la acreditación es el pago de una cuota: la cuota queda cobrada y entra a Tesorería. */
  async match(
    companyId: string,
    clubId: string,
    id: string,
    feeId: string,
    uid: string | undefined,
  ) {
    const m = await this.movement(companyId, clubId, id);
    const amount = Number(m.amount);
    if (m.status !== 'pending')
      throw new ConflictException('El movimiento ya está resuelto');
    if (!(amount > 0))
      throw new BadRequestException('Solo las acreditaciones pagan cuotas');
    const fee = await this.prisma.playerPayment.findFirst({
      where: { id: feeId, companyId, clubId },
      select: { id: true, amount: true, status: true },
    });
    if (!fee) throw new NotFoundException('Cuota no encontrada');
    if (fee.status === 'paid')
      throw new ConflictException('Esa cuota ya está cobrada');
    const base = Number(fee.amount);
    if (round2(amount) < round2(base))
      throw new BadRequestException('El importe no alcanza a cubrir la cuota');
    // Tomamos el movimiento primero: si dos personas confirman a la vez, solo una gana.
    const claimed = await this.prisma.bankMovement.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'matched',
        matchedFeeId: feeId,
        resolvedAt: new Date(),
        resolvedBy: uid ?? null,
      },
    });
    if (claimed.count === 0)
      throw new ConflictException('El movimiento ya está resuelto');
    try {
      await this.payments.update(companyId, feeId, {
        status: 'paid',
        paymentMethod: 'Transferencia',
        paymentDate: dayStr(m.date),
        lateFeeAmount: round2(amount - base),
      } as never);
    } catch (e) {
      await this.prisma.bankMovement.update({
        where: { id },
        data: {
          status: 'pending',
          matchedFeeId: null,
          resolvedAt: null,
          resolvedBy: null,
        },
      });
      throw e;
    }
    return { ok: true };
  }

  /** Lo registra como ingreso o egreso de Tesorería (cuota no, por ejemplo alquiler de cancha o pago a un proveedor). */
  async record(
    companyId: string,
    clubId: string,
    id: string,
    uid: string | undefined,
    input: { category: string; description?: string },
  ) {
    const m = await this.movement(companyId, clubId, id);
    if (m.status !== 'pending')
      throw new ConflictException('El movimiento ya está resuelto');
    const amount = Number(m.amount);
    const claimed = await this.prisma.bankMovement.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'recorded',
        resolvedAt: new Date(),
        resolvedBy: uid ?? null,
      },
    });
    if (claimed.count === 0)
      throw new ConflictException('El movimiento ya está resuelto');
    try {
      const tx = await this.prisma.financialTransaction.create({
        data: {
          companyId,
          clubId,
          type: amount > 0 ? 'income' : 'expense',
          category: input.category.trim() || 'Otros',
          amount: Math.abs(amount),
          occurredAt: new Date(`${dayStr(m.date)}T12:00:00.000Z`),
          description: (input.description?.trim() || m.description).slice(
            0,
            300,
          ),
          reference: `bank:${m.id}`,
        } as Prisma.FinancialTransactionUncheckedCreateInput,
      });
      await this.prisma.bankMovement.update({
        where: { id },
        data: { transactionId: tx.id },
      });
    } catch (e) {
      await this.prisma.bankMovement.update({
        where: { id },
        data: { status: 'pending', resolvedAt: null, resolvedBy: null },
      });
      throw e;
    }
    return { ok: true };
  }

  async ignore(
    companyId: string,
    clubId: string,
    id: string,
    uid: string | undefined,
    note?: string,
  ) {
    await this.movement(companyId, clubId, id);
    const res = await this.prisma.bankMovement.updateMany({
      where: { id, companyId, clubId, status: 'pending' },
      data: {
        status: 'ignored',
        note: note?.trim() || null,
        resolvedAt: new Date(),
        resolvedBy: uid ?? null,
      },
    });
    if (res.count === 0)
      throw new ConflictException('El movimiento ya está resuelto');
    return { ok: true };
  }

  /** Deshace la resolución: la cuota vuelve a pendiente o se quita el asiento de Tesorería. */
  async undo(companyId: string, clubId: string, id: string) {
    const m = await this.movement(companyId, clubId, id);
    if (m.status === 'pending') return { ok: true };
    if (m.status === 'matched' && m.matchedFeeId) {
      await this.payments.update(companyId, m.matchedFeeId, {
        status: 'pending',
      } as never);
    }
    if (m.status === 'recorded' && m.transactionId) {
      await this.prisma.financialTransaction.deleteMany({
        where: { id: m.transactionId, companyId },
      });
    }
    await this.prisma.bankMovement.update({
      where: { id },
      data: {
        status: 'pending',
        matchedFeeId: null,
        transactionId: null,
        note: null,
        resolvedAt: null,
        resolvedBy: null,
      },
    });
    return { ok: true };
  }
}
