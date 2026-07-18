import { Module } from '@nestjs/common';

import { PlayerPaymentsController } from './player-payments.controller';
import { PlayerPaymentsService } from './player-payments.service';

@Module({
  controllers: [PlayerPaymentsController],
  providers: [PlayerPaymentsService],
})
export class PlayerPaymentsModule {}