import { Module } from '@nestjs/common';

import { ClubEmailController } from './email.controller';
import { EmailService } from './email.service';

@Module({
  controllers: [ClubEmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
