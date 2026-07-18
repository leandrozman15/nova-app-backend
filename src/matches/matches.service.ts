import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchCallupStatus, MatchEventType, MatchStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { SetMatchCallupDto } from './dto/set-match-callup.dto';
import { SetMatchResultDto } from './dto/set-match-result.dto';
import { UpdateMatchCallupStatusDto } from './dto/update-match-callup-status.dto';
import { UpdateMatchOperationsDto } from './dto/update-match-operations.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, pagination?: { skip?: number; take?: number; withMeta?: boolean }) {
    const where = { companyId };
    const baseQuery = {
      where,
      include: {
        league: { select: { id: true, name: true, season: true } },
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'desc' as const },
      skip: pagination?.skip,
      take: pagination?.take,
    };

    if (!pagination?.withMeta) {
      return this.prisma.match.findMany(baseQuery);
    }

    const [items, total] = await Promise.all([
      this.prisma.match.findMany(baseQuery),
      this.prisma.match.count({ where }),
    ]);

    const offset = pagination?.skip ?? 0;
    const limit = pagination?.take ?? null;
    const hasMore = pagination?.take ? offset + items.length < total : false;

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
    const match = await this.prisma.match.findFirst({
      where: { companyId, id },
      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
        callups: {
          orderBy: { createdAt: 'asc' },
        },
        events: {
          include: {
            team: true,
            player: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return match;
  }

  async create(companyId: string, dto: CreateMatchDto) {
    if (dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException('Home and away teams must be different');
    }

    return this.prisma.match.create({
      data: {
        companyId,
        leagueId: dto.leagueId,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        scheduledAt: dto.scheduledAt,
        venue: dto.venue,
        notes: dto.notes,
        busDepartureTime: dto.busDepartureTime,
        jersey: dto.jersey,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateMatchDto) {
    await this.ensureMatchExists(companyId, id);

    if (dto.homeTeamId && dto.awayTeamId && dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException('Home and away teams must be different');
    }

    return this.prisma.match.update({
      where: { id },
      data: {
        leagueId: dto.leagueId,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        scheduledAt: dto.scheduledAt,
        venue: dto.venue,
        notes: dto.notes,
        busDepartureTime: dto.busDepartureTime,
        jersey: dto.jersey,
        status: dto.status as MatchStatus | undefined,
      },
    });
  }

  async setResult(companyId: string, id: string, dto: SetMatchResultDto) {
    await this.ensureMatchExists(companyId, id);

    return this.prisma.match.update({
      where: { id },
      data: {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        status: MatchStatus.played,
      },
    });
  }

  async listEvents(companyId: string, matchId: string) {
    await this.ensureMatchExists(companyId, matchId);

    return this.prisma.matchEvent.findMany({
      where: { companyId, matchId },
      include: { player: true, team: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addEvent(companyId: string, matchId: string, dto: CreateMatchEventDto) {
    await this.ensureMatchExists(companyId, matchId);

    return this.prisma.matchEvent.create({
      data: {
        companyId,
        matchId,
        teamId: dto.teamId,
        playerId: dto.playerId,
        minute: dto.minute,
        type: dto.type as MatchEventType,
        note: dto.note,
      },
    });
  }

  async listCallups(companyId: string, matchId: string) {
    await this.ensureMatchExists(companyId, matchId);

    return this.prisma.matchCallup.findMany({
      where: { companyId, matchId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setCallup(companyId: string, matchId: string, dto: SetMatchCallupDto) {
    await this.ensureMatchExists(companyId, matchId);

    return this.prisma.matchCallup.upsert({
      where: {
        matchId_playerExternalId: {
          matchId,
          playerExternalId: dto.playerExternalId,
        },
      },
      create: {
        companyId,
        matchId,
        playerExternalId: dto.playerExternalId,
        playerName: dto.playerName,
        playerPhoto: dto.playerPhoto,
        status: (dto.status as MatchCallupStatus | undefined) ?? MatchCallupStatus.pending,
      },
      update: {
        playerName: dto.playerName,
        playerPhoto: dto.playerPhoto,
        status: dto.status as MatchCallupStatus | undefined,
      },
    });
  }

  async updateCallupStatus(
    companyId: string,
    matchId: string,
    callupId: string,
    dto: UpdateMatchCallupStatusDto,
  ) {
    await this.ensureMatchExists(companyId, matchId);

    const callup = await this.prisma.matchCallup.findFirst({
      where: { companyId, matchId, id: callupId },
      select: { id: true },
    });

    if (!callup) {
      throw new NotFoundException('Match callup not found');
    }

    return this.prisma.matchCallup.update({
      where: { id: callupId },
      data: {
        status: dto.status as MatchCallupStatus,
      },
    });
  }

  async removeCallup(companyId: string, matchId: string, callupId: string) {
    await this.ensureMatchExists(companyId, matchId);

    const callup = await this.prisma.matchCallup.findFirst({
      where: { companyId, matchId, id: callupId },
      select: { id: true },
    });

    if (!callup) {
      throw new NotFoundException('Match callup not found');
    }

    await this.prisma.matchCallup.delete({ where: { id: callupId } });

    return { ok: true };
  }

  async publishCallups(companyId: string, matchId: string) {
    await this.ensureMatchExists(companyId, matchId);
    const publishedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.match.update({
        where: { id: matchId },
        data: { callupsPublishedAt: publishedAt },
      }),
      this.prisma.matchCallup.updateMany({
        where: { companyId, matchId },
        data: { publishedAt },
      }),
    ]);

    return this.getById(companyId, matchId);
  }

  async updateOperations(companyId: string, matchId: string, dto: UpdateMatchOperationsDto) {
    await this.ensureMatchExists(companyId, matchId);

    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        busDepartureTime: dto.busDepartureTime,
        jersey: dto.jersey,
      },
    });
  }

  async submitLineup(companyId: string, matchId: string) {
    await this.ensureMatchExists(companyId, matchId);

    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        lineupSubmittedAt: new Date(),
      },
    });
  }

  async listPlayerCallups(companyId: string, playerExternalId: string) {
    if (!playerExternalId) {
      throw new BadRequestException('Missing player uid');
    }

    return this.prisma.matchCallup.findMany({
      where: {
        companyId,
        playerExternalId,
        publishedAt: { not: null },
      },
      include: {
        match: {
          include: {
            homeTeam: true,
            awayTeam: true,
            league: true,
          },
        },
      },
      orderBy: {
        match: {
          scheduledAt: 'asc',
        },
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.ensureMatchExists(companyId, id);

    await this.prisma.match.delete({ where: { id } });

    return { ok: true };
  }

  private async ensureMatchExists(companyId: string, id: string) {
    const match = await this.prisma.match.findFirst({
      where: { companyId, id },
      select: { id: true },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }
  }
}
