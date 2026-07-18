import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { SetMatchResultDto } from './dto/set-match-result.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Roles('admin', 'manager', 'coach')
  @Get()
  list(@Req() req: unknown) {
    return this.matchesService.list(requireCompanyId(req));
  }

  @Roles('admin', 'manager', 'coach')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.matchesService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateMatchDto) {
    return this.matchesService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id/result')
  setResult(@Req() req: unknown, @Param('id') id: string, @Body() dto: SetMatchResultDto) {
    return this.matchesService.setResult(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Get(':id/events')
  listEvents(@Req() req: unknown, @Param('id') id: string) {
    return this.matchesService.listEvents(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach')
  @Post(':id/events')
  addEvent(@Req() req: unknown, @Param('id') id: string, @Body() dto: CreateMatchEventDto) {
    return this.matchesService.addEvent(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.matchesService.remove(requireCompanyId(req), id);
  }
}
