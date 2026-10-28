import { BadRequestException, Body, Controller, Get, Put, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { AttendanceService } from './attendance.service';
import { TakeAttendanceDto } from './dto/take-attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Roles('admin', 'manager', 'coach')
  @Put('sessions')
  take(@Req() req: unknown, @Body() dto: TakeAttendanceDto) {
    requireClubScope(req, dto.clubId);
    return this.attendance.take(requireCompanyId(req), (req as RequestWithAuth).auth?.uid, dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Get('sessions')
  session(
    @Req() req: unknown,
    @Query('clubId') clubId: string,
    @Query('teamId') teamId: string,
    @Query('date') date: string,
  ) {
    if (!clubId || !teamId || !date) throw new BadRequestException('clubId, teamId y date son obligatorios');
    requireClubScope(req, clubId);
    return this.attendance.getSession(requireCompanyId(req), clubId, teamId, date);
  }

  @Roles('admin', 'manager', 'coach')
  @Get('summary')
  summary(
    @Req() req: unknown,
    @Query('clubId') clubId: string,
    @Query('month') month: string,
    @Query('divisionId') divisionId?: string,
    @Query('teamId') teamId?: string,
  ) {
    if (!clubId || !month) throw new BadRequestException('clubId y month son obligatorios');
    requireClubScope(req, clubId);
    return this.attendance.summary(requireCompanyId(req), clubId, month, { divisionId, teamId });
  }

  @Roles('player', 'member')
  @Get('me')
  mine(@Req() req: unknown, @Query('month') month: string) {
    const uid = (req as RequestWithAuth).auth?.uid;
    if (!uid) throw new BadRequestException('Sin usuario');
    return this.attendance.mine(requireCompanyId(req), uid, month);
  }
}
