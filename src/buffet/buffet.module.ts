import { Module } from '@nestjs/common';

import { BuffetController } from './buffet.controller';
import { BuffetService } from './buffet.service';

@Module({
  controllers: [BuffetController],
  providers: [BuffetService],
})
export class BuffetModule {}
