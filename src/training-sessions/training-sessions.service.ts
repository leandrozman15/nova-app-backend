import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, TrainingSessionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { SetTrainingAttendanceDto } from './dto/set-training-attendance.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';

@Injectable()
export class TrainingSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    companyId: string,
    filters?: {
      clubId?: string;
      teamId?: string;
      from?: string;
      to?: string;
      skip?: number;
      take?: number;
      withMeta?: boolean;
    },
  ) {
    const where = {
      companyId,
      ...(filters?.clubId ? { clubId: filters.clubId } : {}),
      ...(filters?.teamId ? { teamId: filters.teamId } : {}),
      ...(filters?.from || filters?.to
        ? {
            scheduledAt: {
              ...(filters?.from ? { gte: new Date(filters.from) } : {}),
              ...(filters?.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };

    const baseQuery = {
      where,
      include: {
        club: { select: { id: true, name: true } },
        team: { select: { id: true, name: true, category: true } },
      },
      orderBy: { scheduledAt: 'asc' as const },
      skip: filters?.skip,
      take: filters?.take,
    };

    if (!filters?.withMeta) {
      return this.prisma.trainingSession.findMany(baseQuery);
    }

    const [items, total] = await Promise.all([
      this.prisma.trainingSession.findMany(baseQuery),
      this.prisma.trainingSession.count({ where }),
    ]);

    const offset = filters?.skip ?? 0;
    const limit = filters?.take ?? null;
    const hasMore = filters?.take ? offset + items.length < total : false;

    return {
      items,
      meta: {
        total,
        offset,
        limit,
        hasMore,
      },
    };
  }

  async getById(companyId: string, id: string) {
    const session = await this.prisma.trainingSession.findFirst({
      where: { companyId, id },
      include: {
        club: true,
        team: true,
        attendances: {
          include: { player: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Training session not found');
    }

    return session;
  }

  create(companyId: string, dto: CreateTrainingSessionDto) {
    return this.prisma.trainingSession.create({
      data: {
        companyId,
        clubId: dto.clubId,
        teamId: dto.teamId,
        title: dto.title,
        scheduledAt: dto.scheduledAt,
        location: dto.location,
        notes: dto.notes,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateTrainingSessionDto) {
    await this.ensureSessionExists(companyId, id);

    return this.prisma.trainingSession.update({
      where: { id },
      data: {
        clubId: dto.clubId,
        teamId: dto.teamId,
        title: dto.title,
        scheduledAt: dto.scheduledAt,
        status: dto.status as TrainingSessionStatus | undefined,
        location: dto.location,
        notes: dto.notes,
      },
    });
  }

  async listAttendance(companyId: string, sessionId: string) {
    await this.ensureSessionExists(companyId, sessionId);

    return this.prisma.trainingAttendance.findMany({
      where: { companyId, sessionId },
      include: { player: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async setAttendance(companyId: string, sessionId: string, dto: SetTrainingAttendanceDto) {
    await this.ensureSessionExists(companyId, sessionId);

    const player = await this.prisma.player.findFirst({
      where: { companyId, id: dto.playerId },
      select: { id: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.prisma.trainingAttendance.upsert({
      where: {
        sessionId_playerId: {
          sessionId,
          playerId: dto.playerId,
        },
      },
      update: {
        status: dto.status as AttendanceStatus,
        note: dto.note,
      },
      create: {
        companyId,
        sessionId,
        playerId: dto.playerId,
        status: dto.status as AttendanceStatus,
        note: dto.note,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.ensureSessionExists(companyId, id);

    await this.prisma.trainingSession.delete({ where: { id } });

    return { ok: true };
  }

  private async ensureSessionExists(companyId: string, id: string) {
    const session = await this.prisma.trainingSession.findFirst({
      where: { companyId, id },
      select: { id: true },
    });

    if (!session) {
      throw new NotFoundException('Training session not found');
    }
  }
}
