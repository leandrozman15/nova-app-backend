import { Module } from '@nestjs/common';

import { AutoDebitController } from './auto-debit.controller';
import { AutoDebitService } from './auto-debit.service';
import { PlayerPaymentsController } from './player-payments.controller';
import { PlayerPaymentsService } from './player-payments.service';

@Module({
  controllers: [PlayerPaymentsController, AutoDebitController],
  providers: [PlayerPaymentsService, AutoDebitService],
  exports: [PlayerPaymentsService],
})
export class PlayerPaymentsModule {}
