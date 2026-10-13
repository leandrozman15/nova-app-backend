import { Module } from '@nestjs/common';

import {
  ClubPlatformController,
  PlatformController,
  PlatformMeController,
} from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  controllers: [
    PlatformController,
    PlatformMeController,
    ClubPlatformController,
  ],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
