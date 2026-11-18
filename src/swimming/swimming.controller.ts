import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import {
  CreateCompetitionDto,
  CreateEventDto,
  CreateWorkoutDto,
  SaveTimesDto,
  UpdateCompetitionDto,
  UpdateTimeDto,
} from './dto/swimming.dto';
import { SwimmingService } from './swimming.service';

const ROLES = ['admin', 'manager', 'coordinator', 'coach'] as const;

@Controller('swimming')
export class SwimmingController {
  constructor(private readonly service: SwimmingService) {}

  @Roles(...ROLES)
  @Get('competitions')
  listCompetitions(@Req() req: unknown, @Query('clubId') clubId: string) {
    return this.service.listCompetitions(requireCompanyId(req), clubId);
  }

  @Roles(...ROLES)
  @Post('competitions')
  createCompetition(@Req() req: unknown, @Body() dto: CreateCompetitionDto) {
    return this.service.createCompetition(requireCompanyId(req), dto);
  }

  @Roles(...ROLES)
  @Get('competitions/:id')
  getCompetition(@Req() req: unknown, @Param('id') id: string) {
    return this.service.getCompetition(requireCompanyId(req), id);
  }

  @Roles(...ROLES)
  @Patch('competitions/:id')
  updateCompetition(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateCompetitionDto) {
    return this.service.updateCompetition(requireCompanyId(req), id, dto);
  }

  @Roles(...ROLES)
  @Delete('competitions/:id')
  removeCompetition(@Req() req: unknown, @Param('id') id: string) {
    return this.service.removeCompetition(requireCompanyId(req), id);
  }

  @Roles(...ROLES)
  @Post('competitions/:id/events')
  addEvent(@Req() req: unknown, @Param('id') id: string, @Body() dto: CreateEventDto) {
    return this.service.addEvent(requireCompanyId(req), id, dto);
  }

  @Roles(...ROLES)
  @Delete('events/:eventId')
  removeEvent(@Req() req: unknown, @Param('eventId') eventId: string) {
    return this.service.removeEvent(requireCompanyId(req), eventId);
  }

  @Roles(...ROLES)
  @Post('times')
  saveTimes(@Req() req: unknown, @Body() dto: SaveTimesDto) {
    return this.service.saveTimes(requireCompanyId(req), dto);
  }

  @Roles(...ROLES)
  @Get('times')
  listTimes(
    @Req() req: unknown,
    @Query('clubId') clubId: string,
    @Query('playerId') playerId?: string,
    @Query('stroke') stroke?: string,
    @Query('distance') distance?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listTimes(requireCompanyId(req), {
      clubId,
      playerId,
      stroke,
      distance: distance ? Number(distance) || undefined : undefined,
      limit: Math.min(Math.max(Number(limit) || 200, 1), 500),
    });
  }

  @Roles(...ROLES)
  @Patch('times/:id')
  updateTime(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateTimeDto) {
    return this.service.updateTime(requireCompanyId(req), id, dto);
  }

  @Roles(...ROLES)
  @Delete('times/:id')
  removeTime(@Req() req: unknown, @Param('id') id: string) {
    return this.service.removeTime(requireCompanyId(req), id);
  }

  @Roles(...ROLES)
  @Get('records')
  records(@Req() req: unknown, @Query('clubId') clubId: string) {
    return this.service.records(requireCompanyId(req), clubId);
  }

  @Roles(...ROLES)
  @Post('workouts')
  createWorkout(@Req() req: unknown, @Body() dto: CreateWorkoutDto) {
    const auth = (req as { auth?: { email?: string; uid?: string } }).auth;
    return this.service.createWorkout(requireCompanyId(req), dto, auth?.email ?? auth?.uid);
  }

  @Roles(...ROLES)
  @Get('workouts')
  listWorkouts(
    @Req() req: unknown,
    @Query('clubId') clubId: string,
    @Query('teamId') teamId?: string,
    @Query('playerId') playerId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listWorkouts(requireCompanyId(req), {
      clubId,
      teamId,
      playerId,
      limit: Math.min(Math.max(Number(limit) || 30, 1), 100),
    });
  }

  @Roles(...ROLES)
  @Get('workouts/:id')
  getWorkout(@Req() req: unknown, @Param('id') id: string) {
    return this.service.getWorkout(requireCompanyId(req), id);
  }

  @Roles(...ROLES)
  @Delete('workouts/:id')
  removeWorkout(@Req() req: unknown, @Param('id') id: string) {
    return this.service.removeWorkout(requireCompanyId(req), id);
  }

  /** Ficha del nadador: 3 mejores tiempos en entrenamiento y competencia, y evolución por prueba. */
  @Roles(...ROLES)
  @Get('players/:playerId/progress')
  playerProgress(@Req() req: unknown, @Param('playerId') playerId: string) {
    return this.service.progress(requireCompanyId(req), playerId);
  }

  @Roles('player', 'member')
  @Get('me/progress')
  myProgress(@Req() req: unknown) {
    const uid = (req as { auth?: { uid?: string } }).auth?.uid;
    if (!uid) throw new UnauthorizedException('Missing auth context');
    return this.service.myProgress(requireCompanyId(req), uid);
  }
}
