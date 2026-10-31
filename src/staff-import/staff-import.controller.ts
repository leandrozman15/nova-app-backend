import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { actorOf } from '../platform/platform.controller';
import { StaffImportDto } from './staff-import.dto';
import { StaffImportService } from './staff-import.service';

/** Panel de Fluxion: implantación del staff de un club desde la plantilla. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform/clubs/:clubId/staff-import')
export class StaffImportController {
  constructor(private readonly service: StaffImportService) {}

  @Post()
  run(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: StaffImportDto) {
    return this.service.run(actorOf(req), clubId, dto.rows, dto.dryRun ?? true);
  }
}
