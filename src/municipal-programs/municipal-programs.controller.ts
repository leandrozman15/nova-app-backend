import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import {
  CreateEnrollmentDto,
  CreateProgramDto,
  SaveAttendanceDto,
  UpdateProgramDto,
} from './dto/program.dto';
import { MunicipalProgramsService } from './municipal-programs.service';

const ROLES = [
  'admin',
  'fed_admin',
  'municipal_secretary',
  'municipal_admin',
] as const;

@Controller()
export class MunicipalProgramsController {
  constructor(private readonly service: MunicipalProgramsService) {}

  @Roles(...ROLES)
  @Get('municipalities/:municipalityId/programs')
  list(@Req() req: unknown, @Param('municipalityId') municipalityId: string) {
    return this.service.list(requireCompanyId(req), municipalityId);
  }

  @Roles(...ROLES)
  @Post('municipalities/:municipalityId/programs')
  create(
    @Req() req: unknown,
    @Param('municipalityId') municipalityId: string,
    @Body() dto: CreateProgramDto,
  ) {
    return this.service.create(requireCompanyId(req), municipalityId, dto);
  }

  @Roles(...ROLES)
  @Patch('municipal-programs/:id')
  update(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
  ) {
    return this.service.update(requireCompanyId(req), id, dto);
  }

  @Roles(...ROLES)
  @Delete('municipal-programs/:id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.service.remove(requireCompanyId(req), id);
  }

  @Roles(...ROLES)
  @Get('municipal-programs/:id/enrollments')
  enrollments(@Req() req: unknown, @Param('id') id: string) {
    return this.service.listEnrollments(requireCompanyId(req), id);
  }

  @Roles(...ROLES)
  @Post('municipal-programs/:id/enrollments')
  enroll(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: CreateEnrollmentDto,
  ) {
    return this.service.enroll(requireCompanyId(req), id, dto);
  }

  @Roles(...ROLES)
  @Delete('municipal-programs/:id/enrollments/:enrollmentId')
  cancel(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('enrollmentId') enrollmentId: string,
  ) {
    return this.service.cancelEnrollment(
      requireCompanyId(req),
      id,
      enrollmentId,
    );
  }

  @Roles(...ROLES)
  @Get('municipal-programs/:id/attendance')
  attendance(
    @Req() req: unknown,
    @Param('id') id: string,
    @Query('date') date: string,
  ) {
    return this.service.getAttendance(requireCompanyId(req), id, date);
  }

  @Roles(...ROLES)
  @Put('municipal-programs/:id/attendance')
  saveAttendance(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: SaveAttendanceDto,
  ) {
    return this.service.saveAttendance(requireCompanyId(req), id, dto);
  }
}
