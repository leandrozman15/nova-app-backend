import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBoundary } from './boundary';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';

@Injectable()
export class MunicipalitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.municipality.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const municipality = await this.prisma.municipality.findFirst({
      where: { id, companyId },
    });

    if (!municipality) {
      throw new NotFoundException('Municipality not found');
    }

    return municipality;
  }

  create(companyId: string, dto: CreateMunicipalityDto) {
    return this.prisma.municipality.create({
      data: {
        companyId,
        name: dto.name,
        address: dto.address,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        status: dto.status,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateMunicipalityDto) {
    await this.getById(companyId, id);

    let boundary: ReturnType<typeof parseBoundary> | undefined;
    if (dto.boundary !== undefined) {
      boundary = dto.boundary === null ? null : parseBoundary(dto.boundary);
      if (dto.boundary !== null && !boundary) {
        throw new BadRequestException('El contorno debe tener entre 3 y 500 puntos [lat, lng] válidos');
      }
    }

    return this.prisma.municipality.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.address,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        status: dto.status,
        ...(boundary !== undefined && { boundary: boundary === null ? Prisma.DbNull : boundary }),
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.municipality.delete({ where: { id } });

    return { ok: true };
  }
}
