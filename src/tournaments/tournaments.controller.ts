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
import {
  CreateEntryDto,
  CreateTournamentDto,
  ListPublicTournamentsDto,
  ReviewEntryDto,
  TournamentStatusDto,
  UpdateTournamentDto,
} from './dto/tournament.dto';
import { TournamentsService } from './tournaments.service';

const CLUB_STAFF = ['admin', 'club_admin', 'manager', 'coordinator'];

function uid(req: unknown) {
  const auth = (req as RequestWithAuth).auth;
  if (!auth?.uid) throw new UnauthorizedException('Missing auth context');
  return auth.uid;
}

/** Consola: torneos que organiza el club. */
@Roles(...CLUB_STAFF)
@Controller('clubs/:clubId/tournaments')
export class ClubTournamentsController {
  constructor(private readonly service: TournamentsService) {}

  @Get()
  list(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.list(requireCompanyId(req), clubId);
  }

  @Post()
  create(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: CreateTournamentDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.create(requireCompanyId(req), clubId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTournamentDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.update(requireCompanyId(req), clubId, id, dto);
  }

  @Post(':id/status')
  setStatus(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: TournamentStatusDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.setStatus(
      requireCompanyId(req),
      clubId,
      id,
      dto.status,
    );
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

  @Get(':id/entries')
  entries(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    requireClubScope(req, clubId);
    return this.service.listEntries(requireCompanyId(req), clubId, id);
  }

  @Post(':id/entries/:entryId/status')
  reviewEntry(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: ReviewEntryDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.reviewEntry(
      requireCompanyId(req),
      clubId,
      id,
      entryId,
      dto,
    );
  }
}

/** App: torneos publicados (usuarios con cuenta). */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public/tournaments')
export class PublicTournamentsController {
  constructor(private readonly service: TournamentsService) {}

  @Get()
  list(@Query() query: ListPublicTournamentsDto) {
    return this.service.listPublic(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getPublic(id);
  }
}

/** App: inscripciones del usuario. */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('users/me/tournament-entries')
export class MyTournamentEntriesController {
  constructor(private readonly service: TournamentsService) {}

  @Get()
  list(@Req() req: unknown) {
    return this.service.listMyEntries(uid(req));
  }

  @Post()
  create(@Req() req: unknown, @Body() dto: CreateEntryDto) {
    return this.service.createEntry(uid(req), dto);
  }

  @Post(':id/cancel')
  cancel(@Req() req: unknown, @Param('id') id: string) {
    return this.service.cancelMyEntry(uid(req), id);
  }
}
