import { Module } from '@nestjs/common';

import { UsersController } from './users.controller';
import { ProfilePhotoService } from './profile-photo.service';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, ProfilePhotoService],
  exports: [UsersService, ProfilePhotoService],
})
export class UsersModule {}
