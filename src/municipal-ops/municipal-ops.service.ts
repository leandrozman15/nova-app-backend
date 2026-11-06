import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAnnouncementDto,
  CreateDocumentDto,
  CreateRequestDto,
  ResolveRequestDto,
} from './dto/municipal-ops.dto';
import {
  CalendarItem,
  REQUIRED_KINDS,
  canMoveRequest,
  complianceFor,
  documentStatus,
  sortCalendar,
} from './municipal-ops-rules';

@Injectable()
export class MunicipalOpsService {
  constructor(private readonly prisma: PrismaService) {}

  private async municipality(companyId: string, id: string) {
    const m = await this.prisma.municipality.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!m) throw new NotFoundException('Municipality not found');
  }

  private async club(companyId: string, clubId: string) {
    const c = await this.prisma.club.findFirst({ where: { id: clubId, companyId }, select: { id: true, municipalityId: true } });
    if (!c) throw new NotFoundException('Club not found');
    return c;
  }

  // ── Comunicados ─────────────────────────────────────────────

  async listAnnouncements(companyId: string, municipalityId: string) {
    await this.municipality(companyId, municipalityId);
    return this.prisma.municipalAnnouncement.findMany({
      where: { companyId, municipalityId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async createAnnouncement(companyId: string, dto: CreateAnnouncementDto) {
    await this.municipality(companyId, dto.municipalityId);
    return this.prisma.municipalAnnouncement.create({
      data: {
        companyId,
        municipalityId: dto.municipalityId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        audience: dto.audience ?? 'all',
        pinned: dto.pinned === true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async removeAnnouncement(companyId: string, id: string) {
    const a = await this.prisma.municipalAnnouncement.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!a) throw new NotFoundException('Announcement not found');
    await this.prisma.municipalAnnouncement.delete({ where: { id } });
    return { ok: true };
  }

  /** Avisos vigentes del municipio al que pertenece el club. `audience`: clubs o families. */
  async announcementsForClub(companyId: string, clubId: string, audience: 'clubs' | 'families') {
    const club = await this.club(companyId, clubId);
    if (!club.municipalityId) return [];
    return this.prisma.municipalAnnouncement.findMany({
      where: {
        companyId,
        municipalityId: club.municipalityId,
        audience: { in: ['all', audience] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: { id: true, title: true, body: true, pinned: true, createdAt: true, expiresAt: true },
    });
  }

  // ── Documentación ───────────────────────────────────────────

  listClubDocuments(companyId: string, clubId: string) {
    return this.prisma.clubDocument
      .findMany({ where: { companyId, clubId }, orderBy: [{ kind: 'asc' }, { expiresAt: 'desc' }] })
      .then((rows) => rows.map((d) => ({ ...d, status: documentStatus(d.expiresAt) })));
  }

  async createDocument(companyId: string, dto: CreateDocumentDto) {
    await this.club(companyId, dto.clubId);
    const issuedAt = dto.issuedAt ? new Date(dto.issuedAt) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      throw new BadRequestException('El vencimiento no puede ser anterior a la emisión');
    }
    return this.prisma.clubDocument.create({
      data: { companyId, clubId: dto.clubId, kind: dto.kind, title: dto.title.trim(), issuedAt, expiresAt, fileUrl: dto.fileUrl, notes: dto.notes },
    });
  }

  async removeDocument(companyId: string, id: string) {
    const d = await this.prisma.clubDocument.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!d) throw new NotFoundException('Document not found');
    await this.prisma.clubDocument.delete({ where: { id } });
    return { ok: true };
  }

  /** Tablero de cumplimiento: cada institución del municipio con su estado documental. */
  async compliance(companyId: string, municipalityId: string) {
    await this.municipality(companyId, municipalityId);
    const clubs = await this.prisma.club.findMany({
      where: { companyId, municipalityId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const docs = await this.prisma.clubDocument.findMany({
      where: { companyId, clubId: { in: clubs.map((c) => c.id) } },
      select: { clubId: true, kind: true, expiresAt: true },
    });
    return {
      required: REQUIRED_KINDS,
      clubs: clubs.map((c) => ({ id: c.id, name: c.name, ...complianceFor(docs.filter((d) => d.clubId === c.id)) })),
    };
  }

  // ── Pedidos ─────────────────────────────────────────────────

  listClubRequests(companyId: string, clubId: string) {
    return this.prisma.clubRequest.findMany({ where: { companyId, clubId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async createRequest(companyId: string, dto: CreateRequestDto) {
    const club = await this.club(companyId, dto.clubId);
    if (!club.municipalityId) throw new BadRequestException('El club no pertenece a un municipio');
    return this.prisma.clubRequest.create({
      data: {
        companyId,
        clubId: dto.clubId,
        municipalityId: club.municipalityId,
        type: dto.type,
        title: dto.title.trim(),
        description: dto.description,
        amountRequested: dto.amountRequested,
      },
    });
  }

  async listMunicipalRequests(companyId: string, municipalityId: string, status?: string) {
    await this.municipality(companyId, municipalityId);
    const rows = await this.prisma.clubRequest.findMany({
      where: { companyId, municipalityId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const clubs = await this.prisma.club.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clubId as string))] } }, select: { id: true, name: true } });
    const name = new Map(clubs.map((c) => [c.id, c.name]));
    return rows.map((r) => ({ ...r, clubName: name.get(r.clubId) ?? '—' }));
  }

  async resolveRequest(companyId: string, id: string, dto: ResolveRequestDto) {
    const r = await this.prisma.clubRequest.findFirst({ where: { id, companyId } });
    if (!r) throw new NotFoundException('Request not found');
    if (!canMoveRequest(r.status, dto.status)) {
      throw new BadRequestException(`No se puede pasar de ${r.status} a ${dto.status}`);
    }
    return this.prisma.clubRequest.update({
      where: { id },
      data: { status: dto.status, resolutionNote: dto.resolutionNote, resolvedAt: new Date() },
    });
  }

  // ── Calendario único ────────────────────────────────────────

  async calendar(companyId: string, municipalityId: string, from: Date, to: Date) {
    await this.municipality(companyId, municipalityId);
    const clubs = await this.prisma.club.findMany({ where: { companyId, municipalityId }, select: { id: true, name: true } });
    const clubIds = clubs.map((c) => c.id);
    const clubName = new Map(clubs.map((c) => [c.id, c.name]));

    const [matches, bookings, swims] = await Promise.all([
      this.prisma.match.findMany({
        where: { companyId, scheduledAt: { gte: from, lte: to }, league: { is: { municipalityId } } },
        select: { id: true, scheduledAt: true, venue: true, homeTeam: { select: { name: true, clubId: true } }, awayTeam: { select: { name: true } } },
        take: 500,
      }),
      this.prisma.booking.findMany({
        where: { companyId, clubId: { in: clubIds }, startsAt: { gte: from, lte: to }, kind: { in: ['PARTIDO', 'ENTRENAMIENTO'] }, status: 'CONFIRMED' },
        select: { id: true, clubId: true, facilityId: true, kind: true, startsAt: true, endsAt: true },
        take: 500,
      }),
      this.prisma.swimCompetition.findMany({
        where: { companyId, clubId: { in: clubIds }, date: { gte: from, lte: to } },
        select: { id: true, clubId: true, name: true, date: true, venue: true },
        take: 100,
      }),
    ]);
    const facilities = await this.prisma.facility.findMany({
      where: { id: { in: [...new Set(bookings.map((b) => b.facilityId as string))] } },
      select: { id: true, name: true },
    });
    const facName = new Map(facilities.map((f) => [f.id, f.name]));

    const items: CalendarItem[] = [
      ...matches.map((m) => ({
        id: `m:${m.id}`, type: 'match' as const,
        title: `${m.homeTeam?.name ?? 'Local'} vs ${m.awayTeam?.name ?? 'Visitante'}`,
        start: m.scheduledAt.toISOString(), end: null, place: m.venue ?? null, clubId: m.homeTeam?.clubId ?? null,
      })),
      ...bookings.map((b) => ({
        id: `b:${b.id}`, type: 'booking' as const,
        title: `${b.kind === 'PARTIDO' ? 'Partido' : 'Entrenamiento'} · ${clubName.get(b.clubId) ?? ''}`.trim(),
        start: b.startsAt.toISOString(), end: b.endsAt.toISOString(), place: facName.get(b.facilityId) ?? null, clubId: b.clubId,
      })),
      ...swims.map((s) => ({
        id: `s:${s.id}`, type: 'swim' as const, title: s.name, start: s.date.toISOString(), end: null, place: s.venue ?? null, clubId: s.clubId,
      })),
    ];
    return sortCalendar(items, from, to).map((i) => ({ ...i, clubName: i.clubId ? clubName.get(i.clubId) ?? null : null }));
  }
}
