import { Module } from '@nestjs/common';

import { ClubTiktokController, TiktokCallbackController } from './tiktok.controller';
import { TiktokService } from './tiktok.service';

@Module({
  controllers: [ClubTiktokController, TiktokCallbackController],
  providers: [TiktokService],
  exports: [TiktokService],
})
export class TiktokModule {}
