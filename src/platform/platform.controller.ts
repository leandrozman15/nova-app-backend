import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { AuditService, type AuditActor } from './audit.service';
import {
  AddPlatformAdminDto,
  ListAuditDto,
  ListChargesDto,
  MarkChargesDto,
  UpdatePlatformAdminDto,
  UpdatePlatformSettingsDto,
} from './dto/platform.dto';
import {
  mfaRequired,
  PlatformAccessService,
  PlatformAdminGuard,
} from './platform-admin.guard';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformService } from './platform.service';

export function actorOf(req: unknown): AuditActor {
  const auth = (req as RequestWithAuth).auth!;
  return { uid: auth.uid, email: auth.email ?? null };
}

/** Panel de Fluxion: valores, facturación, panorama, administradores y auditoría. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly service: PlatformService,
    private readonly overviewService: PlatformOverviewService,
    private readonly admins: PlatformAdminsService,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  settings() {
    return this.service.getSettings();
  }

  @Put('settings')
  update(@Req() req: unknown, @Body() dto: UpdatePlatformSettingsDto) {
    return this.service.updateSettings(actorOf(req), dto);
  }

  /** Panorama de todos los clubes: usuarios de la app, actividad y facturación. */
  @Get('overview')
  overview() {
    return this.overviewService.overview();
  }

  @Get('charges')
  charges(@Query() query: ListChargesDto) {
    return this.service.listCharges(query);
  }

  @Post('charges/status')
  mark(@Req() req: unknown, @Body() dto: MarkChargesDto) {
    return this.service.markCharges(dto, actorOf(req));
  }

  @Get('admins')
  listAdmins() {
    return this.admins.list();
  }

  @Post('admins')
  addAdmin(@Req() req: unknown, @Body() dto: AddPlatformAdminDto) {
    return this.admins.add(actorOf(req), dto);
  }

  @Patch('admins/:id')
  updateAdmin(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformAdminDto,
  ) {
    return this.admins.update(actorOf(req), id, dto);
  }

  @Get('audit')
  auditLog(@Query() query: ListAuditDto) {
    return this.audit.list(query);
  }
}

/** ¿Soy administrador de Fluxion? (para mostrar las pestañas del panel). */
@NoTenant()
@Controller('platform/me')
export class PlatformMeController {
  constructor(private readonly access: PlatformAccessService) {}

  @Get()
  async me(@Req() req: unknown) {
    const auth = (req as RequestWithAuth).auth;
    const role = await this.access.roleOf(auth);
    return {
      platformAdmin: Boolean(role),
      role,
      mfaRequired: mfaRequired(),
      mfa: Boolean(auth?.mfa),
    };
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
