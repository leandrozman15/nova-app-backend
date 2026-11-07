import { Module } from '@nestjs/common';

import { MunicipalProjectsController } from './municipal-projects.controller';
import { MunicipalProjectsService } from './municipal-projects.service';

@Module({
  controllers: [MunicipalProjectsController],
  providers: [MunicipalProjectsService],
})
export class MunicipalProjectsModule {}
