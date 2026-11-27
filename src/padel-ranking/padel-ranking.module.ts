import { Module } from '@nestjs/common';

import { ClubPadelController, MyPadelProfileController } from './padel-ranking.controller';
import { PadelRankingService } from './padel-ranking.service';

@Module({
  controllers: [MyPadelProfileController, ClubPadelController],
  providers: [PadelRankingService],
  exports: [PadelRankingService],
})
export class PadelRankingModule {}
