import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import { RosterModule } from '../roster/roster.module';
import { PlayerImportController } from './player-import.controller';
import { PlayerImportService } from './player-import.service';

@Module({
  imports: [PlatformModule, RosterModule],
  controllers: [PlayerImportController],
  providers: [PlayerImportService],
})
export class PlayerImportModule {}
