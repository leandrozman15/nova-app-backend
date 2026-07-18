import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, filters?: { clubId?: string }) {
    return this.prisma.facility.findMany({
      where: {
        companyId,
        ...(filters?.clubId ? { clubId: filters.clubId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const facility = await this.prisma.facility.findFirst({ where: { companyId, id } });
    if (!facility) throw new NotFoundException('Facility not found');
    return facility;
  }

  create(companyId: string, dto: CreateFacilityDto) {
    return this.prisma.facility.create({
      data: {
        companyId,
        clubId: dto.clubId,
        name: dto.name,
        type: dto.type,
        typeLabel: dto.typeLabel,
        status: dto.status,
        statusLabel: dto.statusLabel,
        photoUrl: dto.photoUrl,
        address: dto.address,
        neighborhood: dto.neighborhood,
        surfaceType: dto.surfaceType,
        services: dto.services as Prisma.InputJsonValue | undefined,
        capacity: dto.capacity as Prisma.InputJsonValue | undefined,
        meta: dto.meta as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateFacilityDto) {
    await this.getById(companyId, id);
    return this.prisma.facility.update({
      where: { id },
      data: {
        clubId: dto.clubId,
        name: dto.name,
        type: dto.type,
        typeLabel: dto.typeLabel,
        status: dto.status,
        statusLabel: dto.statusLabel,
        photoUrl: dto.photoUrl,
        address: dto.address,
        neighborhood: dto.neighborhood,
        surfaceType: dto.surfaceType,
        services: dto.services as Prisma.InputJsonValue | undefined,
        capacity: dto.capacity as Prisma.InputJsonValue | undefined,
        meta: dto.meta as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);
    await this.prisma.facility.delete({ where: { id } });
    return { ok: true };
  }
}