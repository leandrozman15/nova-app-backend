import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import {
  ListChargesDto,
  MarkChargesDto,
  UpdatePlatformSettingsDto,
} from './dto/platform.dto';
import { isPlatformAdmin, PlatformAdminGuard } from './platform-admin.guard';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformService } from './platform.service';

/** Panel del dueño de Fluxion: valores de los cargos y facturación a clubes. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly service: PlatformService,
    private readonly overview_: PlatformOverviewService,
  ) {}

  @Get('settings')
  settings() {
    return this.service.getSettings();
  }

  @Put('settings')
  update(@Req() req: unknown, @Body() dto: UpdatePlatformSettingsDto) {
    return this.service.updateSettings((req as RequestWithAuth).auth!.uid, dto);
  }

  /** Panorama de todos los clubes: usuarios de la app, actividad y facturación. */
  @Get('overview')
  overview() {
    return this.overview_.overview();
  }

  @Get('charges')
  charges(@Query() query: ListChargesDto) {
    return this.service.listCharges(query);
  }

  @Post('charges/status')
  mark(@Body() dto: MarkChargesDto) {
    return this.service.markCharges(dto);
  }
}

/** ¿Soy el administrador de Fluxion? (para mostrar el panel de facturación). */
@NoTenant()
@Controller('platform/me')
export class PlatformMeController {
  @Get()
  me(@Req() req: unknown) {
    return { platformAdmin: isPlatformAdmin((req as RequestWithAuth).auth) };
  }
}

/** Consola del club: cuánto cuesta y qué le facturó Fluxion. */
@Roles('admin', 'club_admin', 'manager', 'coordinator')
@Controller('clubs/:clubId/platform')
export class ClubPlatformController {
  constructor(private readonly service: PlatformService) {}

  @Get('pricing')
  async pricing(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    const settings = await this.service.getSettings();
    return {
      tournamentPublishFee: settings.tournamentPublishFee,
      tournamentEntryFee: settings.tournamentEntryFee,
      currency: settings.currency,
    };
  }

  @Get('charges')
  charges(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.listClubCharges(clubId);
  }
}
