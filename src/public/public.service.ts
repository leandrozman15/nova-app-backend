import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { isMercadoPagoConfigured } from '../payments/mercadopago.client';
import { PrismaService } from '../prisma/prisma.service';
import { ListPublicClubsDto } from './dto/list-public-clubs.dto';
import { boundingBox, distanceKm } from './geo';

/**
 * Capa de lectura pública ("vidriera"). Reglas:
 * - Solo clubes con isPublic=true, y cada sección solo si el club la habilitó.
 * - Selects explícitos con campos de vidriera: nunca CUIT, email/teléfono
 *   internos, socios, pagos ni nombres de quienes alquilan.
 */
const CLUB_CARD_SELECT = {
  id: true,
  name: true,
  logoUrl: true,
  coverUrl: true,
  sport: true,
  city: true,
  address: true,
  latitude: true,
  longitude: true,
  publicFacilities: true,
  publicSchools: true,
  publicCoaches: true,
  publicShop: true,
  // Portada de respaldo: primera instalación con foto (solo si las canchas son públicas).
  facilities: {
    where: { photoUrl: { not: null } },
    select: { photoUrl: true },
    orderBy: { name: 'asc' },
    take: 1,
  },
} satisfies Prisma.ClubSelect;

const CLUB_DETAIL_SELECT = {
  ...CLUB_CARD_SELECT,
  description: true,
  website: true,
  instagram: true,
  facebook: true,
  depositPercent: true,
  paymentAccount: { select: { id: true } },
} satisfies Prisma.ClubSelect;

const FACILITY_SELECT = {
  id: true,
  name: true,
  type: true,
  typeLabel: true,
  photoUrl: true,
  photos: true,
  bookable: true,
  hourlyPrice: true,
  surfaceType: true,
  services: true,
  address: true,
  neighborhood: true,
} satisfies Prisma.FacilitySelect;

export const RENTAL_DAYS = [
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
  'Dom',
] as const;
export const RENTAL_HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08 a 22
const FREEING_STATUSES = ['cancelled', 'canceled', 'cancelado', 'cancelada'];

const DEFAULT_RADIUS_KM = 50;
const DEFAULT_LIMIT = 50;

type ClubCard = Prisma.ClubGetPayload<{ select: typeof CLUB_CARD_SELECT }>;

function toSections(
  club: Pick<
    ClubCard,
    'publicFacilities' | 'publicSchools' | 'publicCoaches' | 'publicShop'
  >,
) {
  return {
    facilities: club.publicFacilities,
    schools: club.publicSchools,
    coaches: club.publicCoaches,
    shop: club.publicShop,
  };
}

function toCard<T extends ClubCard>(club: T) {
  const {
    publicFacilities,
    publicSchools,
    publicCoaches,
    publicShop,
    facilities,
    coverUrl,
    ...rest
  } = club;
  const fallbackCover = publicFacilities
    ? (facilities[0]?.photoUrl ?? null)
    : null;
  return {
    ...rest,
    coverUrl: coverUrl ?? fallbackCover,
    sections: toSections({
      publicFacilities,
      publicSchools,
      publicCoaches,
      publicShop,
    }),
  };
}

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async listClubs(query: ListPublicClubsDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const hasPoint = query.lat !== undefined && query.lng !== undefined;
    const where: Prisma.ClubWhereInput = { isPublic: true };

    if (query.sport)
      where.sport = { contains: query.sport, mode: 'insensitive' };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { city: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (!hasPoint) {
      const clubs = await this.prisma.club.findMany({
        where,
        select: CLUB_CARD_SELECT,
        orderBy: { name: 'asc' },
        take: limit,
      });
      return clubs.map((club) => ({ ...toCard(club), distanceKm: null }));
    }

    const lat = query.lat!;
    const lng = query.lng!;
    const radiusKm = query.radiusKm ?? DEFAULT_RADIUS_KM;
    const box = boundingBox(lat, lng, radiusKm);
    where.latitude = { gte: box.minLat, lte: box.maxLat };
    where.longitude = { gte: box.minLng, lte: box.maxLng };

    const candidates = await this.prisma.club.findMany({
      where,
      select: CLUB_CARD_SELECT,
      take: 500,
    });
    return candidates
      .map((club) => ({
        ...toCard(club),
        distanceKm:
          Math.round(
            distanceKm(lat, lng, club.latitude!, club.longitude!) * 10,
          ) / 10,
      }))
      .filter((club) => club.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  async getClub(clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, isPublic: true },
      select: CLUB_DETAIL_SELECT,
    });
    if (!club) throw new NotFoundException('Club no encontrado');

    const facilitiesCount = club.publicFacilities
      ? await this.prisma.facility.count({ where: { clubId } })
      : 0;
    const { paymentAccount, ...rest } = club;
    return {
      ...toCard(rest),
      facilitiesCount,
      // Reservas online: el club conectó Mercado Pago y la plataforma lo tiene habilitado.
      onlineBooking:
        club.publicFacilities &&
        Boolean(paymentAccount) &&
        isMercadoPagoConfigured(),
    };
  }

  async listFacilities(clubId: string) {
    await this.requireSection(clubId, 'publicFacilities');
    const facilities = await this.prisma.facility.findMany({
      where: { clubId },
      select: FACILITY_SELECT,
      orderBy: { name: 'asc' },
    });
    return facilities.map(({ hourlyPrice, ...facility }) => ({
      ...facility,
      hourlyPrice: hourlyPrice === null ? null : Number(hourlyPrice),
    }));
  }

  /**
   * Grilla semanal de la cancha: solo qué franjas están ocupadas.
   * No expone quién alquila, teléfonos, precios ni notas.
   */
  async facilityAvailability(clubId: string, facilityId: string) {
    await this.requireSection(clubId, 'publicFacilities');
    const facility = await this.prisma.facility.findFirst({
      where: { id: facilityId, clubId },
      select: { id: true, name: true },
    });
    if (!facility) throw new NotFoundException('Cancha no encontrada');

    const rentals = await this.prisma.facilityRental.findMany({
      where: {
        clubId,
        facilityId,
        NOT: { status: { in: FREEING_STATUSES, mode: 'insensitive' } },
      },
      select: { day: true, hour: true },
    });
    const seen = new Set<string>();
    const occupied = rentals
      .filter(({ day, hour }) => {
        const key = `${day}-${hour}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ day, hour }) => ({ day, hour }));

    return { facility, days: RENTAL_DAYS, hours: RENTAL_HOURS, occupied };
  }

  private async requireSection(
    clubId: string,
    section:
      'publicFacilities' | 'publicSchools' | 'publicCoaches' | 'publicShop',
  ) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, isPublic: true, [section]: true },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Sección no disponible');
  }
}
