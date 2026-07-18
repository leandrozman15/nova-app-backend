import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Roles('admin', 'manager')
  @Get()
  list(@Req() req: unknown) {
    return this.teamsService.list(requireCompanyId(req));
  }

  @Roles('admin', 'manager')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.teamsService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.teamsService.remove(requireCompanyId(req), id);
  }
}
