import { Controller, Delete, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { MunicipalDemoService } from './municipal-demo.service';

/** Solo superadministración: carga/borra datos de demostración de un municipio. */
@Controller('municipal-demo')
@Roles('admin', 'fed_admin')
export class MunicipalDemoController {
  constructor(private readonly service: MunicipalDemoService) {}

  @Post()
  seed(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.seed(requireCompanyId(req), municipalityId);
  }

  @Delete()
  clear(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.clear(requireCompanyId(req), municipalityId);
  }
}
