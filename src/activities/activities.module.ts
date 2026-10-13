import { Module } from '@nestjs/common';

import {
  ClubActivitiesController,
  ClubInquiriesController,
  MyInquiriesController,
  PublicActivitiesController,
} from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  controllers: [
    ClubActivitiesController,
    ClubInquiriesController,
    PublicActivitiesController,
    MyInquiriesController,
  ],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
