import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { InstagramModule } from '../instagram/instagram.module';
import { PushModule } from '../push/push.module';
import { AvailabilityStoryController, AvailabilityStoryCronController, AvailabilityStoryImageController } from './availability-story.controller';
import { AvailabilityStoryService } from './availability-story.service';

@Module({
  imports: [InstagramModule, PushModule, ActivitiesModule],
  controllers: [AvailabilityStoryController, AvailabilityStoryImageController, AvailabilityStoryCronController],
  providers: [AvailabilityStoryService],
})
export class AvailabilityStoryModule {}
