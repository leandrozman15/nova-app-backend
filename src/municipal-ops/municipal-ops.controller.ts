import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import {
  AddReceiptDto,
  CreateAnnouncementDto,
  CreateDocumentDto,
  CreateRequestDto,
  RecordAuditDto,
  ResolveRequestDto,
} from './dto/municipal-ops.dto';
import { MunicipalOpsService } from './municipal-ops.service';

// Escritura: secretaría y dirección. Lectura: suma al inspector (solo consulta).
const MUNICIPAL = ['admin', 'fed_admin', 'municipal_secretary', 'municipal_admin'] as const;
const MUNICIPAL_READ = [...MUNICIPAL, 'municipal_inspector'] as const;

function actorOf(req: unknown) {
  const a = (req as RequestWithAuth).auth;
  return { uid: a?.uid ?? 'unknown', email: a?.email };
}
const CLUB_STAFF = ['admin', 'manager', 'coordinator'] as const;

@Controller('municipal-ops')
export class MunicipalOpsController {
  constructor(private readonly service: MunicipalOpsService) {}

  // ── Municipio ──
  @Roles(...MUNICIPAL_READ)
  @Get('announcements')
  listAnnouncements(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.listAnnouncements(requireCompanyId(req), municipalityId);
  }

  @Roles(...MUNICIPAL)
  @Post('announcements')
  createAnnouncement(@Req() req: unknown, @Body() dto: CreateAnnouncementDto) {
    return this.service.createAnnouncement(requireCompanyId(req), dto, actorOf(req));
  }

  @Roles(...MUNICIPAL)
  @Delete('announcements/:id')
  removeAnnouncement(@Req() req: unknown, @Param('id') id: string) {
    return this.service.removeAnnouncement(requireCompanyId(req), id, actorOf(req));
  }

  @Roles(...MUNICIPAL_READ)
  @Get('compliance')
  compliance(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.compliance(requireCompanyId(req), municipalityId);
  }

  @Roles(...MUNICIPAL_READ)
  @Get('requests')
  listMunicipalRequests(@Req() req: unknown, @Query('municipalityId') municipalityId: string, @Query('status') status?: string) {
    return this.service.listMunicipalRequests(requireCompanyId(req), municipalityId, status);
  }

  @Roles(...MUNICIPAL)
  @Patch('requests/:id')
  resolveRequest(@Req() req: unknown, @Param('id') id: string, @Body() dto: ResolveRequestDto) {
    return this.service.resolveRequest(requireCompanyId(req), id, dto, actorOf(req));
  }

  @Roles(...MUNICIPAL_READ)
  @Get('overview')
  overview(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.overview(requireCompanyId(req), municipalityId);
  }

  @Roles(...MUNICIPAL_READ)
  @Get('audit')
  listAudit(@Req() req: unknown, @Query('municipalityId') municipalityId: string) {
    return this.service.listAudit(requireCompanyId(req), municipalityId);
  }

  /** Registra acciones sensibles hechas en el cliente (ver DNI completo, exportar). */
  @Roles(...MUNICIPAL_READ)
  @Post('audit')
  recordAudit(@Req() req: unknown, @Body() dto: RecordAuditDto) {
    return this.service.recordAudit(requireCompanyId(req), actorOf(req), dto);
  }

  @Roles(...MUNICIPAL)
  @Patch('club/documents/:id/validate')
  validateDocument(@Req() req: unknown, @Param('id') id: string, @Body() body: { valid?: boolean }) {
    return this.service.validateDocument(requireCompanyId(req), id, body?.valid !== false, actorOf(req));
  }

  @Roles(...CLUB_STAFF, ...MUNICIPAL)
  @Post('requests/:id/receipts')
  addReceipt(@Req() req: unknown, @Param('id') id: string, @Body() dto: AddReceiptDto) {
    return this.service.addReceipt(requireCompanyId(req), id, dto, actorOf(req));
  }

  @Roles(...CLUB_STAFF, ...MUNICIPAL)
  @Delete('receipts/:id')
  removeReceipt(@Req() req: unknown, @Param('id') id: string) {
    return this.service.removeReceipt(requireCompanyId(req), id, actorOf(req));
  }

  @Roles(...MUNICIPAL_READ)
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
    return this.service.removeDocument(requireCompanyId(req), id, actorOf(req));
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
