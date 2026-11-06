import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import {
  CreateAnnouncementDto,
  CreateDocumentDto,
  CreateRequestDto,
  ResolveRequestDto,
} from './dto/municipal-ops.dto';
import { MunicipalOpsService } from './municipal-ops.service';

const MUNICIPAL = ['admin', 'fed_admin', 'municipal_secretary', 'municipal_admin'] as const;
const CLUB_STAFF = ['admin', 'manager', 'coordinator'] as const;

@Controller('municipal-ops')
export class MunicipalOpsController {
  constructor(private readonly service: MunicipalOpsService) {}

  // ── Municipio ──
  @Roles(...MUNICIPAL)
  @Get('announcements')
  listAnnouncements(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.listAnnouncements(requireCompanyId(req), municipalityId);
  }

  @Roles(...MUNICIPAL)
  @Post('announcements')
  createAnnouncement(@Req() req: unknown, @Body() dto: CreateAnnouncementDto) {
    return this.service.createAnnouncement(requireCompanyId(req), dto);
  }

  @Roles(...MUNICIPAL)
  @Delete('announcements/:id')
  removeAnnouncement(@Req() req: unknown, @Param('id') id: string) {
    return this.service.removeAnnouncement(requireCompanyId(req), id);
  }

  @Roles(...MUNICIPAL)
  @Get('compliance')
  compliance(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.compliance(requireCompanyId(req), municipalityId);
  }

  @Roles(...MUNICIPAL)
  @Get('requests')
  listMunicipalRequests(@Req() req: unknown, @Query('municipalityId') municipalityId: string, @Query('status') status?: string) {
    return this.service.listMunicipalRequests(requireCompanyId(req), municipalityId, status);
  }

  @Roles(...MUNICIPAL)
  @Patch('requests/:id')
  resolveRequest(@Req() req: unknown, @Param('id') id: string, @Body() dto: ResolveRequestDto) {
    return this.service.resolveRequest(requireCompanyId(req), id, dto);
  }

  @Roles(...MUNICIPAL)
  @Get('calendar')
  calendar(@Req() req: unknown, @Query('municipalityId') municipalityId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date(start.getTime() + 60 * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new BadRequestException('Rango de fechas inválido');
    if (end.getTime() - start.getTime() > 400 * 86_400_000) throw new BadRequestException('El rango máximo es de 400 días');
    return this.service.calendar(requireCompanyId(req), municipalityId, start, end);
  }

  // ── Club (la dirección y el personal del club; el municipio también puede cargar por el club) ──
  @Roles(...CLUB_STAFF, ...MUNICIPAL)
  @Get('club/documents')
  listClubDocuments(@Req() req: unknown, @Query('clubId') clubId: string) {
    return this.service.listClubDocuments(requireCompanyId(req), clubId);
  }

  @Roles(...CLUB_STAFF, ...MUNICIPAL)
  @Post('club/documents')
  createDocument(@Req() req: unknown, @Body() dto: CreateDocumentDto) {
    return this.service.createDocument(requireCompanyId(req), dto);
  }

  @Roles(...CLUB_STAFF, ...MUNICIPAL)
  @Delete('club/documents/:id')
  removeDocument(@Req() req: unknown, @Param('id') id: string) {
    return this.service.removeDocument(requireCompanyId(req), id);
  }

  @Roles(...CLUB_STAFF, ...MUNICIPAL)
  @Get('club/requests')
  listClubRequests(@Req() req: unknown, @Query('clubId') clubId: string) {
    return this.service.listClubRequests(requireCompanyId(req), clubId);
  }

  @Roles(...CLUB_STAFF)
  @Post('club/requests')
  createRequest(@Req() req: unknown, @Body() dto: CreateRequestDto) {
    return this.service.createRequest(requireCompanyId(req), dto);
  }

  /** Avisos del municipio para quien mira el club (dirección o familias). Cualquier usuario autenticado del club. */
  @Get('club/announcements')
  announcementsForClub(@Req() req: unknown, @Query('clubId') clubId: string, @Query('audience') audience?: string) {
    return this.service.announcementsForClub(requireCompanyId(req), clubId, audience === 'families' ? 'families' : 'clubs');
  }
}
