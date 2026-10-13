import { Module } from '@nestjs/common';

import {
  ClubActivitiesController,
  ClubInquiriesController,
  MyInquiriesController,
  PublicActivitiesController,
} from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ClubDisciplinesService } from './club-disciplines.service';
import { RosterModule } from '../roster/roster.module';

@Module({
  imports: [RosterModule],
  controllers: [
    ClubActivitiesController,
    ClubInquiriesController,
    PublicActivitiesController,
    MyInquiriesController,
  ],
  providers: [ActivitiesService, ClubDisciplinesService],
})
export class ActivitiesModule {}
