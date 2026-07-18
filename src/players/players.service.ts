import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.player.findMany({
      where: { companyId },
      include: { club: true, team: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const player = await this.prisma.player.findFirst({
      where: { id, companyId },
      include: { club: true, team: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return player;
  }

  create(companyId: string, dto: CreatePlayerDto) {
    return this.prisma.player.create({
      data: {
        companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        clubId: dto.clubId,
        teamId: dto.teamId,
        dni: dto.dni,
        position: dto.position,
        birthDate: dto.birthDate,
        active: dto.active,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdatePlayerDto) {
    await this.getById(companyId, id);

    return this.prisma.player.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        clubId: dto.clubId,
        teamId: dto.teamId,
        dni: dto.dni,
        position: dto.position,
        birthDate: dto.birthDate,
        active: dto.active,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.player.delete({ where: { id } });

    return { ok: true };
  }
}
