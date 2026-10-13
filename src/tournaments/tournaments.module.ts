import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';

import {
  ClubTournamentsController,
  MyTournamentEntriesController,
  PublicTournamentsController,
} from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [PlatformModule],
  controllers: [
    ClubTournamentsController,
    PublicTournamentsController,
    MyTournamentEntriesController,
  ],
  providers: [TournamentsService],
})
export class TournamentsModule {}
