import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import {
  ClubSubscriptionController,
  PlatformSubscriptionsController,
} from './subscriptions.controller';
import { PlanRequestsService } from './plan-requests.service';
import { SubscriptionsService } from './subscriptions.service';
import { SuspendedClubGuard } from './suspended-club.guard';
import { PlanPackGuard } from './plan-pack.guard';

@Module({
  imports: [PlatformModule],
  controllers: [PlatformSubscriptionsController, ClubSubscriptionController],
  providers: [SubscriptionsService, PlanRequestsService, SuspendedClubGuard, PlanPackGuard],
  exports: [SuspendedClubGuard, PlanPackGuard],
})
export class SubscriptionsModule {}
