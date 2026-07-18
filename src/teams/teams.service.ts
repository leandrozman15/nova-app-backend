import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.team.findMany({
      where: { companyId },
      include: { club: true, league: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, companyId },
      include: { club: true, league: true },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return team;
  }

  create(companyId: string, dto: CreateTeamDto) {
    return this.prisma.team.create({
      data: {
        companyId,
        name: dto.name,
        clubId: dto.clubId,
        leagueId: dto.leagueId,
        category: dto.category,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateTeamDto) {
    await this.getById(companyId, id);

    return this.prisma.team.update({
      where: { id },
      data: {
        name: dto.name,
        clubId: dto.clubId,
        leagueId: dto.leagueId,
        category: dto.category,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.team.delete({ where: { id } });

    return { ok: true };
  }
}
