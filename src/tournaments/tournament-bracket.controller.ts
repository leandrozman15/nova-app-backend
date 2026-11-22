import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
  GenerateBracketDto,
  MatchUpdateDto,
  TeamDto,
} from './dto/bracket.dto';
import { TournamentBracketService } from './tournament-bracket.service';

const CLUB_STAFF = ['admin', 'club_admin', 'manager', 'coordinator'];

/** Consola: cuadro de eliminación del torneo. */
@Roles(...CLUB_STAFF)
@Controller('clubs/:clubId/tournaments/:id/bracket')
export class TournamentBracketController {
  constructor(private readonly service: TournamentBracketService) {}

  private scope(req: unknown, clubId: string) {
    requireClubScope(req, clubId);
    return requireCompanyId(req);
  }

  @Get()
  view(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string) {
    return this.service.view(this.scope(req, clubId), clubId, id);
  }

  @Post('teams')
  addTeam(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: TeamDto,
  ) {
    return this.service.addTeam(this.scope(req, clubId), clubId, id, dto);
  }

  @Patch('teams/:teamId')
  updateTeam(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: TeamDto,
  ) {
    return this.service.updateTeam(this.scope(req, clubId), clubId, id, teamId, dto);
  }

  @Delete('teams/:teamId')
  removeTeam(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Param('teamId') teamId: string,
  ) {
    return this.service.removeTeam(this.scope(req, clubId), clubId, id, teamId);
  }

  @Post('import')
  importEntries(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string) {
    return this.service.importEntries(this.scope(req, clubId), clubId, id);
  }

  @Post('generate')
  generate(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: GenerateBracketDto,
  ) {
    return this.service.generate(this.scope(req, clubId), clubId, id, dto);
  }

  @Patch('matches/:matchId')
  updateMatch(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() dto: MatchUpdateDto,
  ) {
    return this.service.updateMatch(this.scope(req, clubId), clubId, id, matchId, dto);
  }

  @Post('notify')
  notify(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string) {
    return this.service.notifyPending(this.scope(req, clubId), clubId, id);
  }
}

/** App: los partidos de torneo del usuario (día, hora, rival y resultado). */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('users/me/tournament-matches')
export class MyTournamentMatchesController {
  constructor(private readonly service: TournamentBracketService) {}

  @Get()
  list(@Req() req: unknown) {
    const auth = (req as RequestWithAuth).auth;
    if (!auth?.uid) throw new UnauthorizedException('Missing auth context');
    return this.service.myMatches(auth.uid);
  }
}
