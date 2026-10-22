import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get()
  list(@Req() req: unknown) {
    return this.clubsService.list(requireCompanyId(req));
  }

  /** Partidos de torneos de liga donde juega el club. */
  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':id/league-matches')
  leagueMatches(@Req() req: unknown, @Param('id') id: string) {
    requireClubScope(req, id);
    return this.clubsService.leagueMatches(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.clubsService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateClubDto) {
    return this.clubsService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateClubDto) {
    // Un manager solo edita su club activo (antes podía editar cualquier club de la empresa).
    requireClubScope(req, id);
    return this.clubsService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.clubsService.remove(requireCompanyId(req), id);
  }
}
