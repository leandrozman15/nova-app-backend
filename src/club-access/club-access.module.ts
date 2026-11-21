import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { ClubAccessController } from './club-access.controller';
import { ClubAccessService } from './club-access.service';

@Module({
  imports: [UsersModule],
  controllers: [ClubAccessController],
  providers: [ClubAccessService],
  exports: [ClubAccessService],
})
export class ClubAccessModule {}
