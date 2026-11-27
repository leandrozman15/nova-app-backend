import { Module } from '@nestjs/common';

import { PlayerPaymentsModule } from '../player-payments/player-payments.module';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationService } from './bank-reconciliation.service';

@Module({
  imports: [PlayerPaymentsModule],
  controllers: [BankReconciliationController],
  providers: [BankReconciliationService],
})
export class BankReconciliationModule {}
