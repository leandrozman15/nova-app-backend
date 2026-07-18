import { Module } from '@nestjs/common';

import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsService } from './training-sessions.service';

@Module({
  controllers: [TrainingSessionsController],
  providers: [TrainingSessionsService],
})
export class TrainingSessionsModule {}
