import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateLeagueDto } from './dto/create-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';
import { LeaguesService } from './leagues.service';

@Controller('leagues')
export class LeaguesController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'league_admin', 'manager')
  @Get()
  list(@Req() req: unknown) {
    return this.leaguesService.list(requireCompanyId(req));
  }

  @Get(':id/announcements')
  listAnnouncements(@Req() req: unknown, @Param('id') id: string) {
    return this.leaguesService.listAnnouncements(requireCompanyId(req), id);
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
