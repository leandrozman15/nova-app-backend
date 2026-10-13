import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import {
  ClubSubscriptionController,
  PlatformSubscriptionsController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SuspendedClubGuard } from './suspended-club.guard';

@Module({
  imports: [PlatformModule],
  controllers: [PlatformSubscriptionsController, ClubSubscriptionController],
  providers: [SubscriptionsService, SuspendedClubGuard],
  exports: [SuspendedClubGuard],
})
export class SubscriptionsModule {}
