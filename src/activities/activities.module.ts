import { Module } from '@nestjs/common';

import {
  ClubActivitiesController,
  ClubInquiriesController,
  MyInquiriesController,
  PublicActivitiesController,
} from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ClubDisciplinesService } from './club-disciplines.service';

@Module({
  controllers: [
    ClubActivitiesController,
    ClubInquiriesController,
    PublicActivitiesController,
    MyInquiriesController,
  ],
  providers: [ActivitiesService, ClubDisciplinesService],
})
export class ActivitiesModule {}
