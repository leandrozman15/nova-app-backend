import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  AddReceiptDto,
  CreateAnnouncementDto,
  CreateDocumentDto,
  CreateRequestDto,
  RecordAuditDto,
  ResolveRequestDto,
} from './dto/municipal-ops.dto';
import {
  CalendarItem,
  REQUIRED_KINDS,
  canMoveRequest,
  canSettle,
  complianceFor,
  countByMonth,
  documentStatus,
  receiptsTotal,
  sortCalendar,
} from './municipal-ops-rules';

export type Actor = { uid: string; email?: string };

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

  // ── Auditoría ───────────────────────────────────────────────

  async audit(companyId: string, municipalityId: string | null | undefined, actor: Actor, action: string, entity: string, entityId: string | null, summary: string) {
    if (!municipalityId) return;
    try {
      await this.prisma.municipalAuditLog.create({
        data: { companyId, municipalityId, actorUid: actor.uid, actorEmail: actor.email ?? null, action, entity, entityId, summary: summary.slice(0, 300) },
      });
    } catch {
      // La auditoría nunca debe romper la operación principal.
    }
  }

  async recordAudit(companyId: string, actor: Actor, dto: RecordAuditDto) {
    await this.municipality(companyId, dto.municipalityId);
    await this.audit(companyId, dto.municipalityId, actor, dto.action, dto.entity, dto.entityId ?? null, dto.summary ?? dto.action);
    return { ok: true };
  }

  async listAudit(companyId: string, municipalityId: string) {
    await this.municipality(companyId, municipalityId);
    return this.prisma.municipalAuditLog.findMany({ where: { companyId, municipalityId }, orderBy: { createdAt: 'desc' }, take: 200 });
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

  async createAnnouncement(companyId: string, dto: CreateAnnouncementDto, actor?: Actor) {
    await this.municipality(companyId, dto.municipalityId);
    const created = await this.prisma.municipalAnnouncement.create({
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
    if (actor) await this.audit(companyId, dto.municipalityId, actor, 'create', 'announcement', created.id, `Comunicado: ${created.title}`);
    return created;
  }

  async removeAnnouncement(companyId: string, id: string, actor?: Actor) {
    const a = await this.prisma.municipalAnnouncement.findFirst({ where: { id, companyId }, select: { id: true, title: true, municipalityId: true } });
    if (!a) throw new NotFoundException('Announcement not found');
    await this.prisma.municipalAnnouncement.delete({ where: { id } });
    if (actor) await this.audit(companyId, a.municipalityId, actor, 'delete', 'announcement', id, `Comunicado eliminado: ${a.title}`);
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

  async removeDocument(companyId: string, id: string, actor?: Actor) {
    const d = await this.prisma.clubDocument.findFirst({ where: { id, companyId }, select: { id: true, title: true, clubId: true } });
    if (!d) throw new NotFoundException('Document not found');
    await this.prisma.clubDocument.delete({ where: { id } });
    if (actor) {
      const c = await this.club(companyId, d.clubId);
      await this.audit(companyId, c.municipalityId, actor, 'delete', 'document', id, `Documento eliminado: ${d.title}`);
    }
    return { ok: true };
  }

  /** El municipio da por válido (o retira la validación de) un documento cargado por el club. */
  async validateDocument(companyId: string, id: string, valid: boolean, actor: Actor) {
    const d = await this.prisma.clubDocument.findFirst({ where: { id, companyId }, select: { id: true, title: true, clubId: true } });
    if (!d) throw new NotFoundException('Document not found');
    const updated = await this.prisma.clubDocument.update({
      where: { id },
      data: valid ? { validatedAt: new Date(), validatedBy: actor.email ?? actor.uid } : { validatedAt: null, validatedBy: null },
    });
    const c = await this.club(companyId, d.clubId);
    await this.audit(companyId, c.municipalityId, actor, valid ? 'validate' : 'unvalidate', 'document', id, `${valid ? 'Validó' : 'Quitó validación a'}: ${d.title}`);
    return updated;
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
      include: { receipts: { orderBy: { createdAt: 'asc' } } },
    });
    const clubs = await this.prisma.club.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clubId as string))] } }, select: { id: true, name: true } });
    const name = new Map(clubs.map((c) => [c.id, c.name]));
    return rows.map((r) => ({ ...r, clubName: name.get(r.clubId) ?? '—', receiptsTotal: receiptsTotal(r.receipts) }));
  }

  async resolveRequest(companyId: string, id: string, dto: ResolveRequestDto, actor?: Actor) {
    const r = await this.prisma.clubRequest.findFirst({ where: { id, companyId }, include: { receipts: true } });
    if (!r) throw new NotFoundException('Request not found');
    if (!canMoveRequest(r.status, dto.status)) {
      throw new BadRequestException(`No se puede pasar de ${r.status} a ${dto.status}`);
    }
    if (dto.status === 'settled' && !canSettle(r.amountRequested, r.receipts)) {
      throw new BadRequestException('Faltan comprobantes que cubran el monto del subsidio');
    }
    const updated = await this.prisma.clubRequest.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote,
        resolvedAt: new Date(),
        ...(dto.status === 'settled' && { settledAt: new Date() }),
      },
    });
    if (actor) await this.audit(companyId, r.municipalityId, actor, dto.status, 'request', id, `Pedido "${r.title}": ${r.status} → ${dto.status}`);
    return updated;
  }

  /** Comprobantes de rendición: los carga el club (o el municipio por el club) sobre un pedido entregado. */
  async addReceipt(companyId: string, requestId: string, dto: AddReceiptDto, actor?: Actor) {
    const r = await this.prisma.clubRequest.findFirst({ where: { id: requestId, companyId }, select: { id: true, status: true, title: true, municipalityId: true } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'approved' && r.status !== 'delivered') {
      throw new BadRequestException('Solo se rinden pedidos aprobados o entregados');
    }
    const receipt = await this.prisma.clubRequestReceipt.create({
      data: { companyId, requestId, concept: dto.concept.trim(), amount: dto.amount, fileUrl: dto.fileUrl },
    });
    if (actor) await this.audit(companyId, r.municipalityId, actor, 'receipt', 'request', requestId, `Comprobante "${receipt.concept}" en "${r.title}"`);
    return receipt;
  }

  async removeReceipt(companyId: string, id: string, actor?: Actor) {
    const rc = await this.prisma.clubRequestReceipt.findFirst({ where: { id, companyId }, include: { request: { select: { status: true, municipalityId: true, title: true } } } });
    if (!rc) throw new NotFoundException('Receipt not found');
    if (rc.request.status === 'settled') throw new BadRequestException('El pedido ya está rendido');
    await this.prisma.clubRequestReceipt.delete({ where: { id } });
    if (actor) await this.audit(companyId, rc.request.municipalityId, actor, 'receipt_delete', 'request', rc.requestId, `Comprobante eliminado en "${rc.request.title}"`);
    return { ok: true };
  }

  // ── Requiere atención + evolución ───────────────────────────

  async overview(companyId: string, municipalityId: string) {
    await this.municipality(companyId, municipalityId);
    const now = new Date();
    const clubs = await this.prisma.club.findMany({ where: { companyId, municipalityId }, select: { id: true, name: true } });
    const clubIds = clubs.map((c) => c.id);

    const [pending, toSettle, docs, players, lines] = await Promise.all([
      this.prisma.clubRequest.findMany({ where: { companyId, municipalityId, status: 'pending' }, select: { id: true, title: true, createdAt: true, amountRequested: true } }),
      this.prisma.clubRequest.findMany({ where: { companyId, municipalityId, status: 'delivered' }, select: { id: true, title: true, amountRequested: true, receipts: { select: { amount: true } } } }),
      this.prisma.clubDocument.findMany({ where: { companyId, clubId: { in: clubIds } }, select: { clubId: true, kind: true, expiresAt: true } }),
      this.prisma.player.findMany({ where: { companyId, clubId: { in: clubIds } }, select: { createdAt: true, sport: true } }),
      this.prisma.municipalProjectLine.findMany({ where: { project: { companyId, municipalityId } }, select: { spentAmount: true } }),
    ]);

    const compliance = clubs.map((c) => ({ id: c.id, name: c.name, ...complianceFor(docs.filter((d) => d.clubId === c.id), now) }));
    const stalePending = pending.filter((r) => now.getTime() - r.createdAt.getTime() > 7 * 86_400_000);

    const bySport = new Map<string, number>();
    for (const p of players) bySport.set(p.sport ?? 'Sin disciplina', (bySport.get(p.sport ?? 'Sin disciplina') ?? 0) + 1);
    const invested = lines.reduce((t, l) => t + l.spentAmount, 0);

    return {
      attention: {
        pendingRequests: { count: pending.length, stale: stalePending.length, amount: pending.reduce((t, r) => t + (r.amountRequested ?? 0), 0) },
        toSettle: { count: toSettle.length, items: toSettle.map((r) => ({ id: r.id, title: r.title })) },
        docsAlert: compliance.filter((c) => c.level === 'alert').map((c) => ({ id: c.id, name: c.name, missing: c.missing.length, expired: c.expired.length })),
        docsExpiring: compliance.filter((c) => c.level === 'warning').map((c) => ({ id: c.id, name: c.name, expiring: c.expiring.length })),
      },
      evolution: {
        signupsByMonth: countByMonth(players.map((p) => p.createdAt), 12, now),
        athletesBySport: [...bySport.entries()].map(([sport, count]) => ({ sport, count })).sort((a, b) => b.count - a.count),
        athletes: players.length,
        invested,
        costPerAthlete: players.length > 0 ? Math.round(invested / players.length) : null,
      },
    };
  }

  // ── Calendario único ────────────────────────────────────────

  async calendar(companyId: string, municipalityId: string, from: Date, to: Date) {
    await this.municipality(companyId, municipalityId);
    const clubs = await this.prisma.club.findMany({ where: { companyId, municipalityId }, select: { id: true, name: true } });
    const clubIds = clubs.map((c) => c.id);
    const clubName = new Map(clubs.map((c) => [c.id, c.name]));

    const [matches, bookings, swims, projects, programs] = await Promise.all([
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
      this.prisma.municipalProject.findMany({
        where: { companyId, municipalityId, status: { notIn: ['cancelled', 'completed'] }, startDate: { gte: from, lte: to } },
        select: { id: true, name: true, startDate: true, endDate: true, address: true },
        take: 100,
      }),
      this.prisma.municipalProgram.findMany({
        where: { companyId, municipalityId, status: 'open', startDate: { gte: from, lte: to } },
        select: { id: true, name: true, startDate: true, endDate: true, location: true },
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
      ...projects.map((p) => ({
        id: `p:${p.id}`, type: 'project' as const, title: `Proyecto: ${p.name}`,
        start: (p.startDate as Date).toISOString(), end: p.endDate ? p.endDate.toISOString() : null, place: p.address ?? null, clubId: null,
      })),
      ...programs.map((g) => ({
        id: `g:${g.id}`, type: 'program' as const, title: `Programa: ${g.name}`,
        start: (g.startDate as Date).toISOString(), end: g.endDate ? g.endDate.toISOString() : null, place: g.location ?? null, clubId: null,
      })),
    ];
    return sortCalendar(items, from, to).map((i) => ({ ...i, clubName: i.clubId ? clubName.get(i.clubId) ?? null : null }));
  }
}
