import { Module } from '@nestjs/common';

import { FinanceTransactionsController } from './finance-transactions.controller';
import { FinanceTransactionsService } from './finance-transactions.service';

@Module({
  controllers: [FinanceTransactionsController],
  providers: [FinanceTransactionsService],
})
export class FinanceTransactionsModule {}
