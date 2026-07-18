import { Injectable, NotFoundException } from '@nestjs/common';
import { FinancialTransactionType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';

@Injectable()
export class FinanceTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.financialTransaction.findMany({
      where: { companyId },
      include: { club: true },
      orderBy: { occurredAt: 'desc' },
    });
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
