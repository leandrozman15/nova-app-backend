import { Module } from '@nestjs/common';

import { PushModule } from '../push/push.module';
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
  imports: [PushModule],
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
  ],
})
export class CoachesModule {}
