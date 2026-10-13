import { Module } from '@nestjs/common';

import {
  ClubPlatformController,
  PlatformController,
  PlatformMeController,
} from './platform.controller';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformService } from './platform.service';

@Module({
  controllers: [
    PlatformController,
    PlatformMeController,
    ClubPlatformController,
  ],
  providers: [PlatformService, PlatformOverviewService],
  exports: [PlatformService],
})
export class PlatformModule {}
