import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { mergeAmenities } from '../public/public.service';
import { ActivitiesService, normalizeSchedule } from './activities.service';
import { CreateActivityDto } from './dto/activity.dto';

describe('ActivitiesService', () => {
  let prisma: any;
  let service: ActivitiesService;
  const row = {
    id: 'a1',
    name: 'Escuelita de fútbol',
    sport: 'football',
    audience: 'Infantiles 6 a 12',
    description: null,
    coaches: ['Profe Juan'],
    schedule: [{ day: 0, start: '18:00', end: '19:00' }],
    price: { toString: () => '15000' },
    priceUnit: 'mes',
    showPrice: false,
    isPublic: true,
    sortOrder: 0,
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      club: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
      clubActivity: {
        findMany: jest.fn().mockResolvedValue([row]),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(row),
      },
      activityInquiry: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'q1', status: 'NEW' }),
        update: jest.fn(),
      },
    };
    service = new ActivitiesService(prisma);
  });

  describe('listPublic', () => {
    it('hides the price unless the club shows it and the coaches unless they are public', async () => {
      prisma.club.findFirst.mockResolvedValue({ publicCoaches: false });
      const [activity] = await service.listPublic('club-a');
      expect(activity.price).toBeNull();
      expect(activity.priceUnit).toBeNull();
      expect(activity.coaches).toEqual([]);
      expect(prisma.club.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'club-a', isPublic: true, publicSchools: true },
        }),
      );
    });

    it('shows price and coaches when the club allows it', async () => {
      prisma.club.findFirst.mockResolvedValue({ publicCoaches: true });
      prisma.clubActivity.findMany.mockResolvedValue([
        { ...row, showPrice: true },
      ]);
      const [activity] = await service.listPublic('club-a');
      expect(activity.price).toBe(15000);
      expect(activity.priceUnit).toBe('mes');
      expect(activity.coaches).toEqual(['Profe Juan']);
    });

    it('404s when the club does not publish its activities', async () => {
      prisma.club.findFirst.mockResolvedValue(null);
      await expect(service.listPublic('club-a')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createInquiry', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Ana',
        phone: '11 5555-1234',
      });
      prisma.clubActivity.findFirst.mockResolvedValue({
        id: 'a1',
        clubId: 'club-a',
        companyId: 'company-a',
      });
    });

    it('creates the inquiry in the club company for a public activity', async () => {
      const result = await service.createInquiry('fb-ana', {
        activityId: 'a1',
        message: 'Para mi hijo de 8',
      });
      expect(result).toEqual(expect.objectContaining({ created: true }));
      expect(prisma.activityInquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-a',
            clubId: 'club-a',
            userId: 'u1',
          }),
        }),
      );
    });

    it('reuses an open inquiry instead of duplicating it', async () => {
      prisma.activityInquiry.findFirst.mockResolvedValue({ id: 'q0' });
      const result = await service.createInquiry('fb-ana', {
        activityId: 'a1',
      });
      expect(result).toEqual({ id: 'q0', status: 'NEW', created: false });
      expect(prisma.activityInquiry.create).not.toHaveBeenCalled();
    });

    it('requires name and phone and limits open inquiries', async () => {
      prisma.activityInquiry.count.mockResolvedValue(10);
      await expect(
        service.createInquiry('fb-ana', { activityId: 'a1' }),
      ).rejects.toBeInstanceOf(ConflictException);

      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Ana',
        phone: null,
      });
      await expect(
        service.createInquiry('fb-ana', { activityId: 'a1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('sorts schedules and rejects slots that end before they start', () => {
    expect(
      normalizeSchedule([
        { day: 2, start: '10:00', end: '11:00' },
        { day: 0, start: '19:00', end: '20:00' },
        { day: 0, start: '18:00', end: '19:00' },
      ]),
    ).toEqual([
      { day: 0, start: '18:00', end: '19:00' },
      { day: 0, start: '19:00', end: '20:00' },
      { day: 2, start: '10:00', end: '11:00' },
    ]);
    expect(() =>
      normalizeSchedule([{ day: 0, start: '19:00', end: '18:00' }]),
    ).toThrow(BadRequestException);
  });

  it('validates the activity payload', async () => {
    const errors = (body: object) =>
      validate(plainToInstance(CreateActivityDto, body));
    expect(
      await errors({
        name: 'Pádel adultos',
        schedule: [{ day: 1, start: '19:00', end: '20:30' }],
        price: 12000,
        priceUnit: 'mes',
      }),
    ).toHaveLength(0);
    expect(await errors({ name: 'x' })).not.toHaveLength(0);
    expect(
      await errors({
        name: 'Pádel',
        schedule: [{ day: 9, start: '25:00', end: '1' }],
      }),
    ).not.toHaveLength(0);
    expect(await errors({ name: 'Pádel', priceUnit: 'hora' })).not.toHaveLength(
      0,
    );
  });
});

describe('mergeAmenities', () => {
  it('joins club services with court services in catalog order, ignoring unknowns', () => {
    expect(
      mergeAmenities(
        ['estacionamiento', 'wifi'],
        [['showers', 'wifi'], null, ['x', 'toilets']],
      ),
    ).toEqual(['wifi', 'duchas', 'banos', 'estacionamiento']);
  });
});
