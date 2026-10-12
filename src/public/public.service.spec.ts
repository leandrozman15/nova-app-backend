import { NotFoundException } from '@nestjs/common';

import { distanceKm } from './geo';
import { PublicService } from './public.service';

const club = (overrides: Record<string, unknown> = {}) => ({
  id: 'club-1',
  name: 'Club Uno',
  logoUrl: null,
  sport: 'Fútbol',
  city: 'Curitiba',
  address: null,
  latitude: -25.43,
  longitude: -49.27,
  publicFacilities: true,
  publicSchools: false,
  publicCoaches: false,
  publicShop: false,
  coverUrl: null,
  facilities: [],
  ...overrides,
});

describe('PublicService', () => {
  let prisma: any;
  let service: PublicService;

  beforeEach(() => {
    prisma = {
      club: { findMany: jest.fn(), findFirst: jest.fn() },
      facility: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
      facilityRental: { findMany: jest.fn() },
    };
    service = new PublicService(prisma);
  });

  it('only queries public clubs and never selects internal fields', async () => {
    prisma.club.findMany.mockResolvedValue([club()]);
    await service.listClubs({});
    const args = prisma.club.findMany.mock.calls[0][0];
    expect(args.where.isPublic).toBe(true);
    for (const field of [
      'cuit',
      'legalName',
      'email',
      'billingEmail',
      'phone',
      'companyId',
    ]) {
      expect(args.select[field]).toBeUndefined();
    }
  });

  it('sorts by distance and drops clubs outside the radius', async () => {
    const near = club({ id: 'near', latitude: -25.44, longitude: -49.27 });
    const far = club({ id: 'far', latitude: -25.9, longitude: -49.27 });
    const mid = club({ id: 'mid', latitude: -25.5, longitude: -49.27 });
    prisma.club.findMany.mockResolvedValue([far, mid, near]);

    const result = await service.listClubs({
      lat: -25.43,
      lng: -49.27,
      radiusKm: 20,
    });

    expect(result.map((c) => c.id)).toEqual(['near', 'mid']);
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm!);
    expect(result[0]).toEqual(
      expect.objectContaining({
        sections: expect.objectContaining({ facilities: true }),
      }),
    );
    expect(result[0]).not.toHaveProperty('publicFacilities');
  });

  it('falls back to a facility photo as cover only when facilities are public', async () => {
    const photo = 'https://firebasestorage.googleapis.com/v0/b/x/o/f.webp';
    prisma.club.findMany.mockResolvedValue([
      club({ id: 'a', facilities: [{ photoUrl: photo }] }),
      club({
        id: 'b',
        publicFacilities: false,
        facilities: [{ photoUrl: photo }],
      }),
      club({
        id: 'c',
        coverUrl: 'https://firebasestorage.googleapis.com/cover.webp',
        facilities: [{ photoUrl: photo }],
      }),
    ]);

    const [a, b, c] = await service.listClubs({});

    expect(a.coverUrl).toBe(photo);
    expect(b.coverUrl).toBeNull();
    expect(c.coverUrl).toBe(
      'https://firebasestorage.googleapis.com/cover.webp',
    );
    expect(a).not.toHaveProperty('facilities');
  });

  it('returns 404 for a club that is not public', async () => {
    prisma.club.findFirst.mockResolvedValue(null);
    await expect(service.getClub('private-club')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.club.findFirst.mock.calls[0][0].where).toEqual({
      id: 'private-club',
      isPublic: true,
    });
  });

  it('hides facilities when the club did not enable that section', async () => {
    prisma.club.findFirst.mockResolvedValue(null);
    await expect(service.listFacilities('club-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.club.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        id: 'club-1',
        isPublic: true,
        publicFacilities: true,
      }),
    );
    expect(prisma.facility.findMany).not.toHaveBeenCalled();
  });

  it('exposes only occupied day/hour slots, never who rents or the price', async () => {
    prisma.club.findFirst.mockResolvedValue({ id: 'club-1' });
    prisma.facility.findFirst.mockResolvedValue({
      id: 'f-1',
      name: 'Cancha 1',
    });
    prisma.facilityRental.findMany.mockResolvedValue([
      { day: 'Lun', hour: 18 },
      { day: 'Lun', hour: 18 },
      { day: 'Mar', hour: 20 },
    ]);

    const result = await service.facilityAvailability('club-1', 'f-1');

    expect(prisma.facilityRental.findMany.mock.calls[0][0].select).toEqual({
      day: true,
      hour: true,
    });
    expect(result.occupied).toEqual([
      { day: 'Lun', hour: 18 },
      { day: 'Mar', hour: 20 },
    ]);
    expect(result.days).toHaveLength(7);
  });

  it('does not reveal a facility from another club', async () => {
    prisma.club.findFirst.mockResolvedValue({ id: 'club-1' });
    prisma.facility.findFirst.mockResolvedValue(null);
    await expect(
      service.facilityAvailability('club-1', 'other-club-facility'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.facility.findFirst.mock.calls[0][0].where).toEqual({
      id: 'other-club-facility',
      clubId: 'club-1',
    });
  });
});

describe('distanceKm', () => {
  it('computes known distances', () => {
    // Curitiba -> São Paulo ≈ 340 km
    expect(distanceKm(-25.4284, -49.2733, -23.5505, -46.6333)).toBeGreaterThan(
      330,
    );
    expect(distanceKm(-25.4284, -49.2733, -23.5505, -46.6333)).toBeLessThan(
      350,
    );
    expect(distanceKm(1, 1, 1, 1)).toBe(0);
  });
});
