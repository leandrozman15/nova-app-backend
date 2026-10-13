import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import { PlayerImportController } from './player-import.controller';
import { PlayerImportService } from './player-import.service';

@Module({
  imports: [PlatformModule],
  controllers: [PlayerImportController],
  providers: [PlayerImportService],
})
export class PlayerImportModule {}
