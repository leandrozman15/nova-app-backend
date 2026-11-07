import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import {
  ChangeStatusDto,
  CreateProjectDto,
  LineDto,
  NoteDto,
  RecordStaffDto,
  UpdateLineDto,
  UpdateProjectDto,
} from './dto/municipal-projects.dto';
import { MunicipalProjectsService } from './municipal-projects.service';

const MUNICIPAL = ['admin', 'fed_admin', 'municipal_secretary', 'municipal_admin'] as const;

function author(req: unknown): string | undefined {
  return (req as { auth?: { email?: string } })?.auth?.email;
}

@Controller('municipal-projects')
@Roles(...MUNICIPAL)
export class MunicipalProjectsController {
  constructor(private readonly service: MunicipalProjectsService) {}

  @Get()
  list(@Req() req: unknown, @Query('municipalityId') municipalityId: string, @Query('status') status?: string) {
    return this.service.list(requireCompanyId(req), municipalityId, status);
  }

  @Post()
  create(@Req() req: unknown, @Body() dto: CreateProjectDto) {
    return this.service.create(requireCompanyId(req), dto, author(req));
  }

  // Equipo (rutas fijas antes de ':id')
  @Get('team/list')
  listStaff(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.listStaff(requireCompanyId(req), municipalityId);
  }

  @Post('team/record')
  recordStaff(@Req() req: unknown, @Body() dto: RecordStaffDto) {
    return this.service.recordStaff(requireCompanyId(req), dto);
  }

  @Get(':id')
  detail(@Req() req: unknown, @Param('id') id: string) {
    return this.service.detail(requireCompanyId(req), id);
  }

  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.service.update(requireCompanyId(req), id, dto);
  }

  @Post(':id/status')
  changeStatus(@Req() req: unknown, @Param('id') id: string, @Body() dto: ChangeStatusDto) {
    return this.service.changeStatus(requireCompanyId(req), id, dto, author(req));
  }

  @Post(':id/notes')
  addNote(@Req() req: unknown, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.service.addNote(requireCompanyId(req), id, dto.note, author(req));
  }

  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.service.remove(requireCompanyId(req), id);
  }

  @Post(':id/lines')
  addLine(@Req() req: unknown, @Param('id') id: string, @Body() dto: LineDto) {
    return this.service.addLine(requireCompanyId(req), id, dto);
  }

  @Patch(':id/lines/:lineId')
  updateLine(@Req() req: unknown, @Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: UpdateLineDto) {
    return this.service.updateLine(requireCompanyId(req), id, lineId, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(@Req() req: unknown, @Param('id') id: string, @Param('lineId') lineId: string) {
    return this.service.removeLine(requireCompanyId(req), id, lineId);
  }
}
