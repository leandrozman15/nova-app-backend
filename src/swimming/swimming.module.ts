import { Module } from '@nestjs/common';

import { SwimmingController } from './swimming.controller';
import { SwimmingService } from './swimming.service';

@Module({
  controllers: [SwimmingController],
  providers: [SwimmingService],
})
export class SwimmingModule {}
