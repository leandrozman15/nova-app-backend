import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateLeagueDto } from './dto/create-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';

@Injectable()
export class LeaguesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.league.findMany({
      where: { companyId },
      include: { club: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const league = await this.prisma.league.findFirst({
      where: { id, companyId },
      include: { club: true },
    });

    if (!league) {
      throw new NotFoundException('League not found');
    }

    return league;
  }

  create(companyId: string, dto: CreateLeagueDto) {
    return this.prisma.league.create({
      data: {
        companyId,
        name: dto.name,
        season: dto.season,
        clubId: dto.clubId,
        municipalityId: dto.municipalityId,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateLeagueDto) {
    await this.getById(companyId, id);

    return this.prisma.league.update({
      where: { id },
      data: {
        name: dto.name,
        season: dto.season,
        clubId: dto.clubId,
        municipalityId: dto.municipalityId,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.league.delete({ where: { id } });

    return { ok: true };
  }
}
