import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { CreateFacilityRentalDto } from './dto/create-facility-rental.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { UpdateFacilityRentalDto } from './dto/update-facility-rental.dto';

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  listRentals(companyId: string, filters?: { clubId?: string; facilityId?: string }) {
    return this.prisma.facilityRental.findMany({
      where: {
        companyId,
        ...(filters?.clubId ? { clubId: filters.clubId } : {}),
        ...(filters?.facilityId ? { facilityId: filters.facilityId } : {}),
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            type: true,
            typeLabel: true,
          },
        },
      },
      orderBy: [{ day: 'asc' }, { hour: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getRentalById(companyId: string, id: string) {
    const rental = await this.prisma.facilityRental.findFirst({
      where: { companyId, id },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            type: true,
            typeLabel: true,
          },
        },
      },
    });
    if (!rental) throw new NotFoundException('Facility rental not found');
    return rental;
  }

  createRental(companyId: string, dto: CreateFacilityRentalDto) {
    return this.prisma.facilityRental.create({
      data: {
        companyId,
        clubId: dto.clubId,
        facilityId: dto.facilityId,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        status: dto.status ?? 'confirmed',
        isRecurrent: dto.isRecurrent ?? false,
        day: dto.day,
        hour: dto.hour,
        price: dto.price,
        notes: dto.notes,
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            type: true,
            typeLabel: true,
          },
        },
      },
    });
  }

  async updateRental(companyId: string, id: string, dto: UpdateFacilityRentalDto) {
    await this.getRentalById(companyId, id);
    return this.prisma.facilityRental.update({
      where: { id },
      data: {
        clubId: dto.clubId,
        facilityId: dto.facilityId,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        status: dto.status,
        isRecurrent: dto.isRecurrent,
        day: dto.day,
        hour: dto.hour,
        price: dto.price,
        notes: dto.notes,
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            type: true,
            typeLabel: true,
          },
        },
      },
    });
  }

  async removeRental(companyId: string, id: string) {
    await this.getRentalById(companyId, id);
    await this.prisma.facilityRental.delete({ where: { id } });
    return { ok: true };
  }

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