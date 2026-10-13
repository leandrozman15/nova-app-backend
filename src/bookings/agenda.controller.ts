import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { AgendaService } from './agenda.service';
import {
  AgendaBookingDto,
  AgendaQueryDto,
  AgendaSettingsDto,
  AttendanceDto,
  DepositDto,
  EndRecurringDto,
  FacilityDurationsDto,
  OccupancyQueryDto,
  RecurringDto,
  ReleaseDto,
  TurnPaymentDto,
  UpdateRecurringDto,
} from './dto/agenda.dto';

const uidOf = (req: unknown) => (req as RequestWithAuth).auth?.uid ?? 'unknown';

/** Agenda de canchas del club: turnos de la app, manuales y fijos. */
@Roles('admin', 'club_admin', 'manager', 'coordinator')
@Controller('clubs/:clubId/agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  private scope(req: unknown, clubId: string) {
    requireClubScope(req, clubId);
    return requireCompanyId(req);
  }

  @Get()
  list(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query() query: AgendaQueryDto,
  ) {
    return this.agenda.agenda(
      this.scope(req, clubId),
      clubId,
      query.from,
      query.to,
    );
  }

  @Get('occupancy')
  occupancy(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query() query: OccupancyQueryDto,
  ) {
    return this.agenda.occupancy(
      this.scope(req, clubId),
      clubId,
      query.month,
      query.fromMinute,
    );
  }

  @Put('settings')
  settings(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: AgendaSettingsDto,
  ) {
    return this.agenda.updateSettings(this.scope(req, clubId), clubId, dto);
  }

  @Put('facilities/:facilityId/durations')
  durations(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('facilityId') facilityId: string,
    @Body() dto: FacilityDurationsDto,
  ) {
    return this.agenda.updateFacilityDurations(
      this.scope(req, clubId),
      clubId,
      facilityId,
      dto.durations,
    );
  }

  @Post('bookings')
  create(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: AgendaBookingDto,
  ) {
    return this.agenda.createBooking(
      uidOf(req),
      this.scope(req, clubId),
      clubId,
      dto,
    );
  }

  @Post('bookings/:id/confirm')
  confirm(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.agenda.confirm(this.scope(req, clubId), clubId, id);
  }

  @Post('bookings/:id/deposit')
  deposit(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: DepositDto,
  ) {
    return this.agenda.markDeposit(this.scope(req, clubId), clubId, id, dto);
  }

  @Post('bookings/:id/attendance')
  attendance(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: AttendanceDto,
  ) {
    return this.agenda.markAttendance(this.scope(req, clubId), clubId, id, dto);
  }

  @Post('bookings/:id/payment')
  payment(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: TurnPaymentDto,
  ) {
    return this.agenda.registerPayment(
      this.scope(req, clubId),
      clubId,
      id,
      dto,
    );
  }

  @Post('bookings/:id/release')
  release(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: ReleaseDto,
  ) {
    return this.agenda.release(this.scope(req, clubId), clubId, id, dto.reason);
  }

  @Get('recurring')
  recurring(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.agenda.listRecurring(this.scope(req, clubId), clubId);
  }

  @Post('recurring')
  createRecurring(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: RecurringDto,
  ) {
    return this.agenda.createRecurring(
      uidOf(req),
      this.scope(req, clubId),
      clubId,
      dto,
    );
  }

  @Patch('recurring/:id')
  updateRecurring(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringDto,
  ) {
    return this.agenda.updateRecurring(
      this.scope(req, clubId),
      clubId,
      id,
      dto,
    );
  }

  @Post('recurring/:id/end')
  endRecurring(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: EndRecurringDto,
  ) {
    return this.agenda.endRecurring(
      this.scope(req, clubId),
      clubId,
      id,
      dto.from,
    );
  }
}
