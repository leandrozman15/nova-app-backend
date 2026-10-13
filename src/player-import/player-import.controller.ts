import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { actorOf } from '../platform/platform.controller';
import { PlayerImportDto } from './player-import.dto';
import { PlayerImportService } from './player-import.service';

/** Panel de Fluxion: implantación de jugadores de un club desde la plantilla. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform/clubs/:clubId/player-import')
export class PlayerImportController {
  constructor(private readonly service: PlayerImportService) {}

  @Get('template')
  template(@Param('clubId') clubId: string) {
    return this.service.templateData(clubId);
  }

  @Post()
  run(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: PlayerImportDto,
  ) {
    return this.service.run(actorOf(req), clubId, dto.rows, dto.dryRun ?? true);
  }
}
