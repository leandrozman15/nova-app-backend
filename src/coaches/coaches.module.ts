import { Module } from '@nestjs/common';

import { ClubAccessModule } from '../club-access/club-access.module';
import { PushModule } from '../push/push.module';
import { RosterModule } from '../roster/roster.module';
import { CoachAthleteService } from './coach-athlete.service';
import { CoachClubService } from './coach-club.service';
import { CoachCoreService } from './coach-core.service';
import { CoachPortalService } from './coach-portal.service';
import { CoachPublicService } from './coach-public.service';
import {
  ClubCoachesController,
  CoachPortalController,
  MyCoachLessonsController,
  PublicCoachesController,
} from './coaches.controller';

@Module({
  imports: [PushModule, RosterModule, ClubAccessModule],
  controllers: [
    CoachPortalController,
    MyCoachLessonsController,
    PublicCoachesController,
    ClubCoachesController,
  ],
  providers: [
    CoachCoreService,
    CoachPortalService,
    CoachPublicService,
    CoachClubService,
    CoachAthleteService,
  ],
})
export class CoachesModule {}
