import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import {
  isDataImage,
  MediaStorageService,
} from '../firebase/media-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly media?: MediaStorageService,
  ) {}

  /** El logo llega en base64 desde la consola: se sube a Storage y queda la URL. */
  private async logo(value: string | undefined, clubId: string) {
    if (!this.media || !isDataImage(value)) return value;
    return this.media.externalize(value, `clubs/${clubId}/logo`);
  }

  list(companyId: string) {
    return this.prisma.club.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async leagueMatches(companyId: string, clubId: string) {
    await this.getById(companyId, clubId);
    const team = { select: { id: true, name: true, clubId: true } } as const;
    return this.prisma.match.findMany({
      where: {
        companyId,
        tournamentId: { not: null },
        OR: [{ homeTeam: { clubId } }, { awayTeam: { clubId } }],
      },
      include: { homeTeam: team, awayTeam: team, tournament: { select: { id: true, name: true } }, suspensions: true },
      orderBy: { scheduledAt: 'asc' },
      take: 300,
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

    if (dto.bookingMode === 'deposit') {
      const account = await this.prisma.clubPaymentAccount.findUnique({
        where: { clubId: id },
        select: { id: true },
      });
      if (!account)
        throw new ConflictException(
          'Para cobrar seña conectá primero la cuenta de Mercado Pago del club.',
        );
    }

    const foundationDate = dto.foundationDate
      ? new Date(dto.foundationDate)
      : undefined;
    const logoUrl = await this.logo(dto.logoUrl, id);

    return this.prisma.club.update({
      where: { id },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        cuit: dto.cuit,
        foundationDate:
          foundationDate && !Number.isNaN(foundationDate.getTime())
            ? foundationDate
            : undefined,
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
        logoUrl,
        description: dto.description,
        sport: dto.sport,
        status: dto.status,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isPublic: dto.isPublic,
        publicFacilities: dto.publicFacilities,
        publicSchools: dto.publicSchools,
        publicCoaches: dto.publicCoaches,
        publicShop: dto.publicShop,
        coverUrl: dto.coverUrl,
        depositPercent: dto.depositPercent,
        timezone: dto.timezone,
        bookingMode: dto.bookingMode,
        amenities: dto.amenities ? [...new Set(dto.amenities)] : undefined,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.club.delete({ where: { id } });

    return { ok: true };
  }
}
