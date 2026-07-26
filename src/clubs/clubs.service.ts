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
        municipalityId: dto.municipalityId,
        leagueId: dto.leagueId,
        municipalityName: dto.municipalityName,
        address: dto.address,
        sport: dto.sport,
        status: dto.status,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateClubDto) {
    await this.getById(companyId, id);

    const foundationDate = dto.foundationDate ? new Date(dto.foundationDate) : undefined;

    return this.prisma.club.update({
      where: { id },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        cuit: dto.cuit,
        foundationDate: foundationDate && !Number.isNaN(foundationDate.getTime()) ? foundationDate : undefined,
        municipalityId: dto.municipalityId,
        leagueId: dto.leagueId,
        municipalityName: dto.municipalityName,
        address: dto.address,
        city: dto.city,
        phone: dto.phone,
        email: dto.email,
        billingEmail: dto.billingEmail,
        website: dto.website,
        instagram: dto.instagram,
        facebook: dto.facebook,
        logoUrl: dto.logoUrl,
        description: dto.description,
        sport: dto.sport,
        status: dto.status,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.club.delete({ where: { id } });

    return { ok: true };
  }
}
