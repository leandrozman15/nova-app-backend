import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { COMPANY_WIDE_ROLES, requireCompanyId } from '../common/http/request-context';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateLeagueTournamentDto, UpdateLeagueTournamentDto } from './dto/league-tournament.dto';
import { AdvanceTournamentDto, CreateTournamentMatchDto, GenerateFixtureDto, SetCategoryResultDto, SetTournamentResultDto } from './dto/league-fixture.dto';
import { LeagueFixtureService } from './league-fixture.service';
import { CreateLeagueDto } from './dto/create-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';
import { LeagueScopeGuard } from './league-scope.guard';
import { CreateSubLeagueDto } from './dto/create-sub-league.dto';
import { LeaguesService } from './leagues.service';

@Controller('leagues')
@UseGuards(LeagueScopeGuard)
export class LeaguesController {
  constructor(
    private readonly leaguesService: LeaguesService,
    private readonly fixtureService: LeagueFixtureService,
  ) {}

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Get()
  list(@Req() req: unknown) {
    return this.leaguesService.list(requireCompanyId(req), (req as RequestWithAuth).auth?.leagueId);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Get(':id/players')
  listPlayers(@Req() req: unknown, @Param('id') id: string, @Query('scope') scope?: string) {
    return this.leaguesService.listFederatedPlayers(requireCompanyId(req), id, scope === 'all');
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Get(':id/sub-leagues')
  listSubLeagues(@Req() req: unknown, @Param('id') id: string) {
    return this.leaguesService.listSubLeagues(requireCompanyId(req), id);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Post(':id/sub-leagues')
  createSubLeague(@Req() req: unknown, @Param('id') id: string, @Body() dto: CreateSubLeagueDto) {
    return this.leaguesService.createSubLeague(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Get(':id/tournaments')
  listTournaments(@Req() req: unknown, @Param('id') id: string) {
    return this.leaguesService.listTournaments(requireCompanyId(req), id);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Post(':id/tournaments')
  createTournament(@Req() req: unknown, @Param('id') id: string, @Body() dto: CreateLeagueTournamentDto) {
    return this.leaguesService.createTournament(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Patch(':id/tournaments/:tournamentId')
  updateTournament(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: UpdateLeagueTournamentDto,
  ) {
    return this.leaguesService.updateTournament(requireCompanyId(req), id, tournamentId, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Delete(':id/tournaments/:tournamentId')
  removeTournament(@Req() req: unknown, @Param('id') id: string, @Param('tournamentId') tournamentId: string) {
    return this.leaguesService.removeTournament(requireCompanyId(req), id, tournamentId);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Get(':id/tournaments/:tid/matches')
  listTournamentMatches(@Req() req: unknown, @Param('id') id: string, @Param('tid') tid: string) {
    return this.fixtureService.list(requireCompanyId(req), id, tid);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Post(':id/tournaments/:tid/fixture')
  generateFixture(@Req() req: unknown, @Param('id') id: string, @Param('tid') tid: string, @Body() dto: GenerateFixtureDto) {
    return this.fixtureService.generate(requireCompanyId(req), id, tid, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Post(':id/tournaments/:tid/matches')
  createTournamentMatch(@Req() req: unknown, @Param('id') id: string, @Param('tid') tid: string, @Body() dto: CreateTournamentMatchDto) {
    return this.fixtureService.createMatch(requireCompanyId(req), id, tid, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Delete(':id/tournaments/:tid/matches/:matchId')
  removeTournamentMatch(@Req() req: unknown, @Param('id') id: string, @Param('tid') tid: string, @Param('matchId') matchId: string) {
    return this.fixtureService.removeMatch(requireCompanyId(req), id, tid, matchId);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Get(':id/tournaments/:tid/standings')
  tournamentStandings(@Req() req: unknown, @Param('id') id: string, @Param('tid') tid: string) {
    return this.fixtureService.standings(requireCompanyId(req), id, tid);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Post(':id/tournaments/:tid/advance')
  advanceTournament(@Req() req: unknown, @Param('id') id: string, @Param('tid') tid: string, @Body() dto: AdvanceTournamentDto) {
    return this.fixtureService.advance(requireCompanyId(req), id, tid, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Patch(':id/tournaments/:tid/matches/:matchId/result')
  setTournamentResult(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('tid') tid: string,
    @Param('matchId') matchId: string,
    @Body() dto: SetTournamentResultDto,
  ) {
    return this.fixtureService.setResult(requireCompanyId(req), id, tid, matchId, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Patch(':id/tournaments/:tid/matches/:matchId/categories/:category')
  setCategoryResult(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('tid') tid: string,
    @Param('matchId') matchId: string,
    @Param('category') category: string,
    @Body() dto: SetCategoryResultDto,
  ) {
    return this.fixtureService.setCategoryResult(requireCompanyId(req), id, tid, matchId, category, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Delete(':id/tournaments/:tid/matches/:matchId/categories/:category')
  removeCategoryResult(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('tid') tid: string,
    @Param('matchId') matchId: string,
    @Param('category') category: string,
  ) {
    return this.fixtureService.removeCategoryResult(requireCompanyId(req), id, tid, matchId, category);
  }

  @Get(':id/announcements')
  listAnnouncements(@Req() req: unknown, @Param('id') id: string, @Query('clubId') clubId?: string) {
    const auth = (req as RequestWithAuth).auth;
    const role = auth?.role?.trim().toLowerCase();
    // Los roles de club solo ven lo dirigido a su club; los de liga/empresa pueden filtrar por club.
    const scope = role && COMPANY_WIDE_ROLES.has(role) ? clubId : (auth?.clubId ?? '__none__');
    return this.leaguesService.listAnnouncements(requireCompanyId(req), id, scope);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Post(':id/announcements')
  createAnnouncement(@Req() req: unknown, @Param('id') id: string, @Body() dto: CreateAnnouncementDto) {
    return this.leaguesService.createAnnouncement(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Delete(':id/announcements/:announcementId')
  removeAnnouncement(@Req() req: unknown, @Param('id') id: string, @Param('announcementId') announcementId: string) {
    return this.leaguesService.removeAnnouncement(requireCompanyId(req), id, announcementId);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.leaguesService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateLeagueDto) {
    return this.leaguesService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateLeagueDto) {
    return this.leaguesService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.leaguesService.remove(requireCompanyId(req), id);
  }
}
