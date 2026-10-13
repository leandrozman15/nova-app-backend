import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import { RosterModule } from '../roster/roster.module';
import {
  DocStoreController,
  DocStoreMigrationController,
} from './docstore.controller';
import { DocStoreMigrationService } from './docstore-migration.service';
import { DocStoreService } from './docstore.service';

@Module({
  imports: [PlatformModule, RosterModule],
  controllers: [DocStoreController, DocStoreMigrationController],
  providers: [DocStoreService, DocStoreMigrationService],
  exports: [DocStoreService],
})
export class DocStoreModule {}
