import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { ActivitiesService } from './activities.service';
import {
  CreateActivityDto,
  CreateInquiryDto,
  DisciplineSettingsDto,
  InquiryStatusDto,
  UpdateActivityDto,
} from './dto/activity.dto';

const CLUB_STAFF = ['admin', 'club_admin', 'manager', 'coordinator'];

function uid(req: unknown) {
  const auth = (req as RequestWithAuth).auth;
  if (!auth?.uid) throw new UnauthorizedException('Missing auth context');
  return auth.uid;
}

/** Consola: actividades que el club muestra en la app. */
@Roles(...CLUB_STAFF)
@Controller('clubs/:clubId/activities')
export class ClubActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  list(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.list(requireCompanyId(req), clubId);
  }

  @Post()
  create(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: CreateActivityDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.create(requireCompanyId(req), clubId, dto);
  }

  /** Configuración en la app de una disciplina de la consola ("disc_<id>"). */
  @Patch('disciplines/:disciplineId')
  saveDiscipline(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('disciplineId') disciplineId: string,
    @Body() dto: DisciplineSettingsDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.saveDisciplineSettings(
      requireCompanyId(req),
      clubId,
      disciplineId,
      dto,
    );
  }

  @Patch(':id')
  update(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.update(requireCompanyId(req), clubId, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    requireClubScope(req, clubId);
    return this.service.remove(requireCompanyId(req), clubId, id);
  }
}

/** Consola: consultas de disponibilidad recibidas. */
@Roles(...CLUB_STAFF)
@Controller('clubs/:clubId/activity-inquiries')
export class ClubInquiriesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  list(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query() query: Partial<InquiryStatusDto>,
  ) {
    requireClubScope(req, clubId);
    const status = ['NEW', 'CONTACTED', 'CLOSED'].includes(query.status ?? '')
      ? query.status
      : undefined;
    return this.service.listInquiries(requireCompanyId(req), clubId, status);
  }

  @Post(':id/status')
  setStatus(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: InquiryStatusDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.setInquiryStatus(
      requireCompanyId(req),
      clubId,
      id,
      dto.status,
    );
  }
}

/** App: actividades del club (usuarios con cuenta). */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public/clubs/:clubId/activities')
export class PublicActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  list(@Param('clubId') clubId: string) {
    return this.service.listPublic(clubId);
  }
}

/** App: consultas del usuario. */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('users/me/activity-inquiries')
export class MyInquiriesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  list(@Req() req: unknown) {
    return this.service.listMyInquiries(uid(req));
  }

  @Post()
  create(@Req() req: unknown, @Body() dto: CreateInquiryDto) {
    return this.service.createInquiry(uid(req), dto);
  }
}
