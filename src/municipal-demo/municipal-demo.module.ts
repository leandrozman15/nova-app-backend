import { Module } from '@nestjs/common';

import { MunicipalDemoController } from './municipal-demo.controller';
import { MunicipalDemoService } from './municipal-demo.service';

@Module({
  controllers: [MunicipalDemoController],
  providers: [MunicipalDemoService],
})
export class MunicipalDemoModule {}
