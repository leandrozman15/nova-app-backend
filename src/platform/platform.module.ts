import { Module } from '@nestjs/common';

import {
  ClubPlatformController,
  PlatformController,
  PlatformMeController,
} from './platform.controller';
import { AuditService } from './audit.service';
import {
  PlatformAccessService,
  PlatformAdminGuard,
} from './platform-admin.guard';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformService } from './platform.service';

@Module({
  controllers: [
    PlatformController,
    PlatformMeController,
    ClubPlatformController,
  ],
  providers: [
    PlatformService,
    PlatformOverviewService,
    PlatformAdminsService,
    PlatformAccessService,
    PlatformAdminGuard,
    AuditService,
  ],
  exports: [
    PlatformService,
    PlatformAccessService,
    PlatformAdminGuard,
    AuditService,
  ],
})
export class PlatformModule {}
