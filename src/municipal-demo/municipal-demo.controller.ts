import { Controller, Delete, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { MunicipalDemoService } from './municipal-demo.service';

/** Datos de demostración de un municipio. Superadmin siempre; usuarios del municipio solo si no tiene clubes reales. */
@Controller('municipal-demo')
@Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin')
export class MunicipalDemoController {
  constructor(private readonly service: MunicipalDemoService) {}

  @Post()
  seed(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    const role = (req as { auth?: { role?: string } }).auth?.role;
    const platformAdmin = role === 'admin' || role === 'fed_admin';
    return this.service.seed(
      requireCompanyId(req),
      municipalityId,
      platformAdmin,
    );
  }

  @Delete()
  clear(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.clear(requireCompanyId(req), municipalityId);
  }
}
