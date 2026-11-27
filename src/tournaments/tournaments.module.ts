import { Module } from '@nestjs/common';

import { PadelRankingModule } from '../padel-ranking/padel-ranking.module';
import { PlatformModule } from '../platform/platform.module';
import { PushModule } from '../push/push.module';

import {
  ClubTournamentsController,
  MyTournamentEntriesController,
  PublicTournamentsController,
} from './tournaments.controller';
import {
  MyTournamentMatchesController,
  TournamentBracketController,
} from './tournament-bracket.controller';
import { TournamentBracketService } from './tournament-bracket.service';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [PlatformModule, PushModule, PadelRankingModule],
  controllers: [
    ClubTournamentsController,
    PublicTournamentsController,
    MyTournamentEntriesController,
    TournamentBracketController,
    MyTournamentMatchesController,
  ],
  providers: [TournamentsService, TournamentBracketService],
})
export class TournamentsModule {}
