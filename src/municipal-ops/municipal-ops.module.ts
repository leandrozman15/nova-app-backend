import { Module } from '@nestjs/common';

import { MunicipalOpsController } from './municipal-ops.controller';
import { MunicipalOpsService } from './municipal-ops.service';

@Module({
  controllers: [MunicipalOpsController],
  providers: [MunicipalOpsService],
})
export class MunicipalOpsModule {}
