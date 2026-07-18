import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { parseBooleanFlag, parsePagination } from '../common/http/pagination';
import { requireCompanyId } from '../common/http/request-context';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { SetMatchCallupDto } from './dto/set-match-callup.dto';
import { SetMatchResultDto } from './dto/set-match-result.dto';
import { UpdateMatchCallupStatusDto } from './dto/update-match-callup-status.dto';
import { UpdateMatchOperationsDto } from './dto/update-match-operations.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Roles('admin', 'manager', 'coach')
  @Get()
  list(
    @Req() req: unknown,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('withMeta') withMeta?: string,
  ) {
    return this.matchesService.list(requireCompanyId(req), {
      ...parsePagination(limit, offset),
      withMeta: parseBooleanFlag(withMeta),
    });
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
  @Get(':id/callups')
  listCallups(@Req() req: unknown, @Param('id') id: string) {
    return this.matchesService.listCallups(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach')
  @Put(':id/callups')
  setCallup(@Req() req: unknown, @Param('id') id: string, @Body() dto: SetMatchCallupDto) {
    return this.matchesService.setCallup(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id/callups/:callupId')
  updateCallupStatus(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('callupId') callupId: string,
    @Body() dto: UpdateMatchCallupStatusDto,
  ) {
    return this.matchesService.updateCallupStatus(requireCompanyId(req), id, callupId, dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Delete(':id/callups/:callupId')
  removeCallup(@Req() req: unknown, @Param('id') id: string, @Param('callupId') callupId: string) {
    return this.matchesService.removeCallup(requireCompanyId(req), id, callupId);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id/callups/publish')
  publishCallups(@Req() req: unknown, @Param('id') id: string) {
    return this.matchesService.publishCallups(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id/operations')
  updateOperations(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateMatchOperationsDto) {
    return this.matchesService.updateOperations(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id/lineup-submit')
  submitLineup(@Req() req: unknown, @Param('id') id: string) {
    return this.matchesService.submitLineup(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach', 'player')
  @Get('callups/me')
  listMyCallups(@Req() req: { auth?: { uid?: string }; headers?: Record<string, string> }) {
    return this.matchesService.listPlayerCallups(requireCompanyId(req), req.auth?.uid ?? '');
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
