import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.club.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const club = await this.prisma.club.findFirst({
      where: { id, companyId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return club;
  }

  create(companyId: string, dto: CreateClubDto) {
    return this.prisma.club.create({
      data: {
        companyId,
        name: dto.name,
        municipalityName: dto.municipalityName,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateClubDto) {
    await this.getById(companyId, id);

    return this.prisma.club.update({
      where: { id },
      data: {
        name: dto.name,
        municipalityName: dto.municipalityName,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.club.delete({ where: { id } });

    return { ok: true };
  }
}
