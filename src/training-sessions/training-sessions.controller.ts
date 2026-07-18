import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { parseBooleanFlag, parsePagination } from '../common/http/pagination';
import { requireCompanyId } from '../common/http/request-context';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { SetTrainingAttendanceDto } from './dto/set-training-attendance.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { TrainingSessionsService } from './training-sessions.service';

@Controller('training-sessions')
export class TrainingSessionsController {
  constructor(private readonly trainingSessionsService: TrainingSessionsService) {}

  @Roles('admin', 'manager', 'coach')
  @Get()
  list(
    @Req() req: unknown,
    @Query('clubId') clubId?: string,
    @Query('teamId') teamId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('withMeta') withMeta?: string,
  ) {
    return this.trainingSessionsService.list(requireCompanyId(req), {
      clubId,
      teamId,
      from,
      to,
      ...parsePagination(limit, offset),
      withMeta: parseBooleanFlag(withMeta),
    });
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.trainingSessionsService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateTrainingSessionDto) {
    return this.trainingSessionsService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateTrainingSessionDto) {
    return this.trainingSessionsService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':id/attendance')
  listAttendance(@Req() req: unknown, @Param('id') id: string) {
    return this.trainingSessionsService.listAttendance(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Put(':id/attendance')
  setAttendance(@Req() req: unknown, @Param('id') id: string, @Body() dto: SetTrainingAttendanceDto) {
    return this.trainingSessionsService.setAttendance(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.trainingSessionsService.remove(requireCompanyId(req), id);
  }
}
