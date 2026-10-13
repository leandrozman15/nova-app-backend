import 'reflect-metadata';

jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class FirebaseAdminService {},
}));

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
  let disciplines: any;
  let service: ActivitiesService;
  const row = {
    id: 'a1',
    disciplineId: null,
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
        upsert: jest.fn().mockResolvedValue({
          id: 'row-hockey',
          clubId: 'club-a',
          companyId: 'company-a',
          isPublic: true,
        }),
      },
      activityInquiry: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'q1', status: 'NEW' }),
        update: jest.fn(),
      },
    };
    disciplines = {
      listPublic: jest.fn().mockResolvedValue([]),
      exists: jest.fn(),
    };
    service = new ActivitiesService(prisma, disciplines);
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
          where: expect.objectContaining({
            id: 'club-a',
            isPublic: true,
            publicSchools: true,
          }),
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

  describe('disciplines from the console', () => {
    const hockey = {
      id: 'disc_hockey',
      kind: 'discipline',
      name: 'Hockey',
      sport: 'hockey',
      emoji: '🏑',
      season: '2025',
      audience: 'Femenino · 9 a 40 años',
      description: null,
      coaches: ['Luciana Sosa'],
      groups: [
        {
          name: 'Primera',
          schedule: [{ day: 0, start: '18:30', end: '20:00' }],
          coaches: [],
        },
      ],
    };

    it('lists console disciplines first, with the club price only when shown', async () => {
      prisma.club.findFirst.mockResolvedValue({ publicCoaches: true });
      disciplines.listPublic.mockResolvedValue([hockey]);
      prisma.clubActivity.findMany.mockResolvedValue([
        row,
        {
          ...row,
          id: 'row-hockey',
          disciplineId: 'disc_hockey',
          showPrice: true,
          description: 'Escuela para chicas',
        },
      ]);

      const list = await service.listPublic('club-a');

      expect(disciplines.listPublic).toHaveBeenCalledWith('club-a', true);
      expect(list.map((item) => item.id)).toEqual(['disc_hockey', 'a1']);
      expect(list[0]).toEqual(
        expect.objectContaining({
          kind: 'discipline',
          price: 15000,
          description: 'Escuela para chicas',
          groups: hockey.groups,
        }),
      );
    });

    it('hides a discipline the club turned off', async () => {
      prisma.club.findFirst.mockResolvedValue({ publicCoaches: false });
      disciplines.listPublic.mockResolvedValue([hockey]);
      prisma.clubActivity.findMany.mockResolvedValue([
        { ...row, disciplineId: 'disc_hockey', isPublic: false },
      ]);
      expect(await service.listPublic('club-a')).toEqual([]);
    });

    it('saves app settings for a discipline without copying its data', async () => {
      prisma.club.findFirst.mockResolvedValue({ id: 'club-a' });
      disciplines.exists.mockResolvedValue(hockey);
      await service.saveDisciplineSettings(
        'company-a',
        'club-a',
        'disc_hockey',
        {
          price: 20000,
          priceUnit: 'mes',
          showPrice: true,
        },
      );
      expect(prisma.clubActivity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clubId_disciplineId: {
              clubId: 'club-a',
              disciplineId: 'disc_hockey',
            },
          },
          create: expect.objectContaining({ name: 'Hockey', price: 20000 }),
        }),
      );
    });

    it('hangs an inquiry about a discipline on its settings row', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Ana',
        phone: '11 5555-1234',
      });
      prisma.club.findFirst.mockResolvedValue({
        id: 'club-a',
        companyId: 'company-a',
      });
      disciplines.exists.mockResolvedValue(hockey);

      await service.createInquiry('fb-ana', {
        activityId: 'disc_hockey',
        clubId: 'club-a',
      });

      expect(prisma.activityInquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activityId: 'row-hockey' }),
        }),
      );
      await expect(
        service.createInquiry('fb-ana', { activityId: 'disc_hockey' }),
      ).rejects.toBeInstanceOf(BadRequestException);
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
