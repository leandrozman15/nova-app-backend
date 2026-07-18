import { Injectable, NotFoundException } from '@nestjs/common';
import { InjuryStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateInjuryReportDto } from './dto/create-injury-report.dto';
import { UpdateInjuryReportDto } from './dto/update-injury-report.dto';

@Injectable()
export class InjuriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, filters?: { clubId?: string; teamId?: string; playerId?: string; status?: string }) {
    return this.prisma.injuryReport.findMany({
      where: {
        companyId,
        ...(filters?.clubId ? { clubId: filters.clubId } : {}),
        ...(filters?.teamId ? { teamId: filters.teamId } : {}),
        ...(filters?.playerId ? { playerId: filters.playerId } : {}),
        ...(filters?.status ? { status: filters.status as InjuryStatus } : {}),
      },
      include: {
        club: true,
        team: true,
        player: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const report = await this.prisma.injuryReport.findFirst({
      where: { companyId, id },
      include: {
        club: true,
        team: true,
        player: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Injury report not found');
    }

    return report;
  }

  create(companyId: string, dto: CreateInjuryReportDto) {
    return this.prisma.injuryReport.create({
      data: {
        companyId,
        clubId: dto.clubId,
        teamId: dto.teamId,
        playerId: dto.playerId,
        description: dto.description,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateInjuryReportDto) {
    await this.getById(companyId, id);

    return this.prisma.injuryReport.update({
      where: { id },
      data: {
        clubId: dto.clubId,
        teamId: dto.teamId,
        playerId: dto.playerId,
        description: dto.description,
        status: dto.status as InjuryStatus | undefined,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });
  }

  async resolve(companyId: string, id: string, endDate?: Date) {
    await this.getById(companyId, id);

    return this.prisma.injuryReport.update({
      where: { id },
      data: {
        status: InjuryStatus.recovered,
        endDate: endDate ?? new Date(),
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.injuryReport.delete({ where: { id } });

    return { ok: true };
  }
}
