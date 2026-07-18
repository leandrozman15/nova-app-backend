import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchEventType, MatchStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { SetMatchResultDto } from './dto/set-match-result.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.match.findMany({
      where: { companyId },
      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const match = await this.prisma.match.findFirst({
      where: { companyId, id },
      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
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
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateMatchDto) {
    await this.getById(companyId, id);

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
        status: dto.status as MatchStatus | undefined,
      },
    });
  }

  async setResult(companyId: string, id: string, dto: SetMatchResultDto) {
    await this.getById(companyId, id);

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
    await this.getById(companyId, matchId);

    return this.prisma.matchEvent.findMany({
      where: { companyId, matchId },
      include: { player: true, team: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addEvent(companyId: string, matchId: string, dto: CreateMatchEventDto) {
    await this.getById(companyId, matchId);

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

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.match.delete({ where: { id } });

    return { ok: true };
  }
}
