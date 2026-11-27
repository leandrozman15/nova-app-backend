import { Module } from '@nestjs/common';

import {
  ClubPadelController,
  MyPadelProfileController,
  MyPadelTournamentsController,
} from './padel-ranking.controller';
import { PadelRankingService } from './padel-ranking.service';

@Module({
  controllers: [MyPadelProfileController, MyPadelTournamentsController, ClubPadelController],
  providers: [PadelRankingService],
  exports: [PadelRankingService],
})
export class PadelRankingModule {}
