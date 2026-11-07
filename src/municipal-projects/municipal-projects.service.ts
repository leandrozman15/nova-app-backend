import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeStatusDto,
  CreateProjectDto,
  LineDto,
  RecordStaffDto,
  UpdateLineDto,
  UpdateProjectDto,
} from './dto/municipal-projects.dto';
import { approvalBlocker, budgetTotals, canMoveProject, isClosed } from './municipal-projects-rules';

@Injectable()
export class MunicipalProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async municipality(companyId: string, id: string) {
    const m = await this.prisma.municipality.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!m) throw new NotFoundException('Municipality not found');
  }

  private async project(companyId: string, id: string) {
    const p = await this.prisma.municipalProject.findFirst({ where: { id, companyId }, include: { lines: { orderBy: { createdAt: 'asc' } } } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  private assertOpen(status: string) {
    if (isClosed(status)) throw new ConflictException('El proyecto está cerrado y no se puede modificar');
  }

  // ── Proyectos ──

  async list(companyId: string, municipalityId: string, status?: string) {
    await this.municipality(companyId, municipalityId);
    const rows = await this.prisma.municipalProject.findMany({
      where: { companyId, municipalityId, ...(status && { status }) },
      include: { lines: { select: { plannedAmount: true, spentAmount: true } } },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return rows.map(({ lines, ...p }) => ({ ...p, budget: budgetTotals(lines) }));
  }

  async create(companyId: string, dto: CreateProjectDto, author?: string) {
    await this.municipality(companyId, dto.municipalityId);
    if (dto.startDate && dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException('La fecha de fin es anterior al inicio');
    }
    return this.prisma.municipalProject.create({
      data: {
        companyId,
        municipalityId: dto.municipalityId,
        name: dto.name.trim(),
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        responsible: dto.responsible,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        events: { create: { kind: 'status', toStatus: 'draft', note: 'Proyecto creado', author } },
      },
    });
  }

  async detail(companyId: string, id: string) {
    const p = await this.project(companyId, id);
    const events = await this.prisma.municipalProjectEvent.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
    const { lines, ...rest } = p;
    return { ...rest, lines, events, budget: budgetTotals(lines) };
  }

  async update(companyId: string, id: string, dto: UpdateProjectDto) {
    const p = await this.project(companyId, id);
    this.assertOpen(p.status);
    const start = dto.startDate ? new Date(dto.startDate) : p.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : p.endDate;
    if (start && end && end < start) throw new BadRequestException('La fecha de fin es anterior al inicio');
    return this.prisma.municipalProject.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        responsible: dto.responsible,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async changeStatus(companyId: string, id: string, dto: ChangeStatusDto, author?: string) {
    const p = await this.project(companyId, id);
    if (!canMoveProject(p.status, dto.status)) {
      throw new ConflictException(`No se puede pasar de ${p.status} a ${dto.status}`);
    }
    const blocker = approvalBlocker(dto.status, p.lines);
    if (blocker) throw new BadRequestException(blocker);
    const [updated] = await this.prisma.$transaction([
      this.prisma.municipalProject.update({ where: { id }, data: { status: dto.status } }),
      this.prisma.municipalProjectEvent.create({
        data: { projectId: id, kind: 'status', fromStatus: p.status, toStatus: dto.status, note: dto.note, author },
      }),
    ]);
    return updated;
  }

  async addNote(companyId: string, id: string, note: string, author?: string) {
    await this.project(companyId, id);
    return this.prisma.municipalProjectEvent.create({ data: { projectId: id, kind: 'note', note, author } });
  }

  async remove(companyId: string, id: string) {
    const p = await this.project(companyId, id);
    if (p.status !== 'draft' && p.status !== 'cancelled') {
      throw new ConflictException('Solo se pueden borrar proyectos en borrador o cancelados');
    }
    await this.prisma.municipalProject.delete({ where: { id } });
    return { ok: true };
  }

  // ── Presupuesto ──

  async addLine(companyId: string, id: string, dto: LineDto) {
    const p = await this.project(companyId, id);
    this.assertOpen(p.status);
    return this.prisma.municipalProjectLine.create({
      data: { projectId: id, concept: dto.concept.trim(), category: dto.category, plannedAmount: dto.plannedAmount, spentAmount: dto.spentAmount ?? 0 },
    });
  }

  async updateLine(companyId: string, id: string, lineId: string, dto: UpdateLineDto) {
    const p = await this.project(companyId, id);
    this.assertOpen(p.status);
    if (!p.lines.some((l) => l.id === lineId)) throw new NotFoundException('Line not found');
    return this.prisma.municipalProjectLine.update({
      where: { id: lineId },
      data: { concept: dto.concept?.trim(), category: dto.category, plannedAmount: dto.plannedAmount, spentAmount: dto.spentAmount },
    });
  }

  async removeLine(companyId: string, id: string, lineId: string) {
    const p = await this.project(companyId, id);
    this.assertOpen(p.status);
    if (!p.lines.some((l) => l.id === lineId)) throw new NotFoundException('Line not found');
    await this.prisma.municipalProjectLine.delete({ where: { id: lineId } });
    return { ok: true };
  }

  // ── Equipo del municipio ──

  async listStaff(companyId: string, municipalityId: string) {
    await this.municipality(companyId, municipalityId);
    return this.prisma.municipalStaff.findMany({ where: { companyId, municipalityId }, orderBy: { createdAt: 'desc' } });
  }

  /** Registra en el equipo a un usuario ya creado y aprovisionado como secretaría municipal. */
  async recordStaff(companyId: string, dto: RecordStaffDto) {
    await this.municipality(companyId, dto.municipalityId);
    return this.prisma.municipalStaff.upsert({
      where: { firebaseUid: dto.firebaseUid },
      update: { email: dto.email.toLowerCase(), name: dto.name, municipalityId: dto.municipalityId },
      create: { companyId, municipalityId: dto.municipalityId, firebaseUid: dto.firebaseUid, email: dto.email.toLowerCase(), name: dto.name, role: 'municipal_secretary' },
    });
  }
}
