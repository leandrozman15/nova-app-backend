import { Module } from '@nestjs/common';

import { MunicipalProgramsController } from './municipal-programs.controller';
import { MunicipalProgramsService } from './municipal-programs.service';

@Module({
  controllers: [MunicipalProgramsController],
  providers: [MunicipalProgramsService],
})
export class MunicipalProgramsModule {}
