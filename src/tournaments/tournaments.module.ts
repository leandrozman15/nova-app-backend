import { Module } from '@nestjs/common';

import {
  ClubTournamentsController,
  MyTournamentEntriesController,
  PublicTournamentsController,
} from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  controllers: [
    ClubTournamentsController,
    PublicTournamentsController,
    MyTournamentEntriesController,
  ],
  providers: [TournamentsService],
})
export class TournamentsModule {}
