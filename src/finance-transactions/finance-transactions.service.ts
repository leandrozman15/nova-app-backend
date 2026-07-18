import { Injectable, NotFoundException } from '@nestjs/common';
import { FinancialTransactionType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';

@Injectable()
export class FinanceTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(companyId: string, filters?: { from?: string; to?: string; clubId?: string }) {
    const where = {
      companyId,
      ...(filters?.clubId ? { clubId: filters.clubId } : {}),
      ...(filters?.from || filters?.to
        ? {
            occurredAt: {
              ...(filters?.from ? { gte: new Date(filters.from) } : {}),
              ...(filters?.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };

    const [incomeAgg, expenseAgg, totalCount] = await Promise.all([
      this.prisma.financialTransaction.aggregate({
        where: {
          ...where,
          type: FinancialTransactionType.income,
        },
        _sum: { amount: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: {
          ...where,
          type: FinancialTransactionType.expense,
        },
        _sum: { amount: true },
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);

    const income = Number(incomeAgg._sum.amount ?? 0);
    const expense = Number(expenseAgg._sum.amount ?? 0);

    return {
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      transactionCount: totalCount,
      filters: {
        from: filters?.from ?? null,
        to: filters?.to ?? null,
        clubId: filters?.clubId ?? null,
      },
    };
  }

  async list(companyId: string, pagination?: { skip?: number; take?: number; withMeta?: boolean }) {
    const where = { companyId };
    const baseQuery = {
      where,
      include: {
        club: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'desc' as const },
      skip: pagination?.skip,
      take: pagination?.take,
    };

    if (!pagination?.withMeta) {
      return this.prisma.financialTransaction.findMany(baseQuery);
    }

    const [items, total] = await Promise.all([
      this.prisma.financialTransaction.findMany(baseQuery),
      this.prisma.financialTransaction.count({ where }),
    ]);

    const offset = pagination?.skip ?? 0;
    const limit = pagination?.take ?? null;
    const hasMore = pagination?.take ? offset + items.length < total : false;

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

  async getById(companyId: string, id: string) {
    const transaction = await this.prisma.financialTransaction.findFirst({
      where: { companyId, id },
      include: { club: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  create(companyId: string, dto: CreateFinanceTransactionDto) {
    return this.prisma.financialTransaction.create({
      data: {
        companyId,
        type: dto.type as FinancialTransactionType,
        category: dto.category,
        amount: dto.amount,
        currency: dto.currency,
        occurredAt: dto.occurredAt,
        clubId: dto.clubId,
        description: dto.description,
        reference: dto.reference,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateFinanceTransactionDto) {
    await this.getById(companyId, id);

    return this.prisma.financialTransaction.update({
      where: { id },
      data: {
        type: dto.type as FinancialTransactionType | undefined,
        category: dto.category,
        amount: dto.amount,
        currency: dto.currency,
        occurredAt: dto.occurredAt,
        clubId: dto.clubId,
        description: dto.description,
        reference: dto.reference,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.financialTransaction.delete({ where: { id } });

    return { ok: true };
  }
}
