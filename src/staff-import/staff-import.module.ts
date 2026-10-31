import { Module } from '@nestjs/common';

import { FirebaseModule } from '../firebase/firebase.module';
import { PlatformModule } from '../platform/platform.module';
import { RosterModule } from '../roster/roster.module';
import { UsersModule } from '../users/users.module';
import { StaffImportController } from './staff-import.controller';
import { StaffImportService } from './staff-import.service';

@Module({
  imports: [PlatformModule, RosterModule, UsersModule, FirebaseModule],
  controllers: [StaffImportController],
  providers: [StaffImportService],
})
export class StaffImportModule {}
