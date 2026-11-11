import { Module } from '@nestjs/common';

import {
  ClubFacebookController,
  FacebookCallbackController,
} from './facebook.controller';
import { FacebookService } from './facebook.service';

@Module({
  controllers: [ClubFacebookController, FacebookCallbackController],
  providers: [FacebookService],
  exports: [FacebookService],
})
export class FacebookModule {}
