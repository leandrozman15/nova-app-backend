import { Module } from '@nestjs/common';

import {
  ClubInstagramController,
  InstagramCallbackController,
} from './instagram.controller';
import { InstagramService } from './instagram.service';

@Module({
  controllers: [ClubInstagramController, InstagramCallbackController],
  providers: [InstagramService],
  exports: [InstagramService],
})
export class InstagramModule {}
