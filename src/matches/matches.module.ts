import { Module } from '@nestjs/common';

import { MatchesController } from './matches.controller';
import { MatchSuspensionsService } from './match-suspensions.service';
import { MatchesService } from './matches.service';

@Module({
  controllers: [MatchesController],
  providers: [MatchesService, MatchSuspensionsService],
})
export class MatchesModule {}
