import { Module } from '@nestjs/common';

import { MatchesController } from './matches.controller';
import { MatchSuspensionsService } from './match-suspensions.service';
import { MatchScheduleService } from './match-schedule.service';
import { MatchesService } from './matches.service';

@Module({
  controllers: [MatchesController],
  providers: [MatchesService, MatchSuspensionsService, MatchScheduleService],
})
export class MatchesModule {}
