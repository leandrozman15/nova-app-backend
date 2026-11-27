import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { ClubProfileDto, DeclareProfileDto, RecategorizeDto } from './dto/padel.dto';
import { PadelRankingService } from './padel-ranking.service';

const uidOf = (req: unknown) => (req as RequestWithAuth).auth?.uid;

/** Mi categoría de pádel: declararla y verla. */
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('users/me/padel-profile')
export class MyPadelProfileController {
  constructor(private readonly ranking: PadelRankingService) {}

  @Get()
  mine(@Req() req: unknown) {
    return this.ranking.myProfile(uidOf(req)!);
  }

  @Post()
  declare(@Req() req: unknown, @Body() dto: DeclareProfileDto) {
    return this.ranking.declare(uidOf(req)!, dto.dni, dto.category);
  }
}

/** Mis torneos (de cualquier club): para ver estado e historial sin pertenecer a ningún club. */
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('users/me/padel-tournaments')
export class MyPadelTournamentsController {
  constructor(private readonly ranking: PadelRankingService) {}

  @Get()
  mine(@Req() req: unknown) {
    return this.ranking.myTournaments(uidOf(req)!);
  }
}

/** Dirección del club: padrón de jugadores de la red, altas y recategorización auditada. */
@Roles('admin', 'manager')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('clubs/:clubId/padel')
export class ClubPadelController {
  constructor(private readonly ranking: PadelRankingService) {}

  @Get('profiles')
  list(@Req() req: unknown, @Param('clubId') clubId: string, @Query('search') search?: string) {
    requireClubScope(req, clubId);
    return this.ranking.roster(clubId, search);
  }

  /** Buscar en toda la red (solo para no cargar un perfil duplicado). */
  @Get('profiles/network-search')
  networkSearch(@Req() req: unknown, @Param('clubId') clubId: string, @Query('search') search?: string) {
    requireClubScope(req, clubId);
    return this.ranking.search(search);
  }

  @Get('profiles/:id')
  detail(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string) {
    requireClubScope(req, clubId);
    return this.ranking.detail(id);
  }

  @Post('profiles')
  create(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: ClubProfileDto) {
    requireClubScope(req, clubId);
    return this.ranking.clubUpsert(requireCompanyId(req), clubId, uidOf(req), dto);
  }

  @Post('profiles/:id/recategorize')
  recategorize(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string, @Body() dto: RecategorizeDto) {
    requireClubScope(req, clubId);
    return this.ranking.recategorize(clubId, uidOf(req), id, dto);
  }
}
