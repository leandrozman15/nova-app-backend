import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateTournamentDto } from './dto/tournament.dto';
import {
  normalizeDays,
  registrationState,
  TournamentsService,
} from './tournaments.service';

const future = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('TournamentsService', () => {
  let prisma: any;
  let platform: any;
  let service: TournamentsService;
  const published = {
    id: 't1',
    companyId: 'company-a',
    clubId: 'club-a',
    entryType: 'equipo',
    status: 'PUBLISHED',
    registrationDeadline: null,
    startDate: future(10),
    maxEntries: 8,
    club: { timezone: 'America/Argentina/Buenos_Aires' },
  };

  beforeEach(() => {
    prisma = {
      club: { findFirst: jest.fn().mockResolvedValue({ id: 'club-a' }) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', name: 'Ana', phone: '11 5555-1234' }),
      },
      clubTournament: {
        findFirst: jest.fn().mockResolvedValue(published),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({
          ...data,
          id: 't1',
          registrationFee: data.registrationFee ?? null,
        })),
        update: jest.fn().mockResolvedValue({}),
      },
      tournamentEntry: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'e1', status: 'PENDING' }),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    platform = {
      chargeTournamentPublished: jest.fn(),
      chargeEntryAccepted: jest.fn(),
      voidEntryCharge: jest.fn(),
    };
    service = new TournamentsService(prisma, platform);
  });

  describe('rules', () => {
    it('sorts days and derives first and last date', () => {
      expect(
        normalizeDays([
          { date: '2026-11-08', start: '09:00', end: '13:00' },
          { date: '2026-11-07', start: '09:00', end: '18:00' },
        ]),
      ).toEqual({
        days: [
          { date: '2026-11-07', start: '09:00', end: '18:00' },
          { date: '2026-11-08', start: '09:00', end: '13:00' },
        ],
        startDate: '2026-11-07',
        endDate: '2026-11-08',
      });
      expect(() =>
        normalizeDays([{ date: '2026-11-07', start: '18:00', end: '09:00' }]),
      ).toThrow(BadRequestException);
    });

    it('opens registration only while published, before the deadline and with spots', () => {
      const base = {
        status: 'PUBLISHED' as const,
        registrationDeadline: '2026-11-05',
        startDate: '2026-11-07',
        maxEntries: 8,
      };
      expect(registrationState(base, 3, '2026-11-01')).toEqual({
        open: true,
        spotsLeft: 5,
      });
      expect(registrationState(base, 8, '2026-11-01').open).toBe(false);
      expect(registrationState(base, 0, '2026-11-06').open).toBe(false);
      expect(
        registrationState({ ...base, status: 'CLOSED' }, 0, '2026-11-01').open,
      ).toBe(false);
      expect(
        registrationState({ ...base, maxEntries: null }, 50, '2026-11-01'),
      ).toEqual({ open: true, spotsLeft: null });
    });

    it('validates the tournament payload', async () => {
      const errors = (body: object) =>
        validate(plainToInstance(CreateTournamentDto, body));
      expect(
        await errors({
          name: 'Copa Primavera',
          sport: 'football',
          variant: 'futbol_5',
          days: [{ date: '2026-11-07', start: '09:00', end: '18:00' }],
          venues: [{ name: 'Sede central', address: 'Av. Siempre Viva 123' }],
          registrationFee: 60000,
          feeUnit: 'equipo',
          prizes: ['1º: $300.000 + trofeo'],
        }),
      ).toHaveLength(0);
      expect(await errors({ name: 'Copa', sport: 'curling' })).not.toHaveLength(
        0,
      );
      expect(
        await errors({ name: 'Copa', sport: 'football', feeUnit: 'mes' }),
      ).not.toHaveLength(0);
    });
  });

  describe('console', () => {
    it('creates a draft with dates derived from its days', async () => {
      await service.create('company-a', 'club-a', {
        name: 'Copa Primavera',
        sport: 'football',
        variant: 'futbol_5',
        days: [{ date: '2026-11-07', start: '09:00', end: '18:00' }],
      });
      expect(prisma.clubTournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-a',
            clubId: 'club-a',
            startDate: '2026-11-07',
            endDate: '2026-11-07',
          }),
        }),
      );
    });

    it('rejects a variant from another sport and a deadline after the start', async () => {
      await expect(
        service.create('company-a', 'club-a', {
          name: 'Copa',
          sport: 'padel',
          variant: 'futbol_5',
        }),
      ).rejects.toThrow('no corresponde');
      await expect(
        service.create('company-a', 'club-a', {
          name: 'Copa',
          sport: 'football',
          days: [{ date: '2026-11-07', start: '09:00', end: '18:00' }],
          registrationDeadline: '2026-11-10',
        }),
      ).rejects.toThrow('fecha límite');
    });

    it('only publishes with days and venues', async () => {
      prisma.clubTournament.findFirst.mockResolvedValue({
        id: 't1',
        days: [],
        venues: [],
        endDate: null,
        publishedAt: null,
      });
      await expect(
        service.setStatus('company-a', 'club-a', 't1', 'PUBLISHED'),
      ).rejects.toThrow('al menos un día');

      prisma.clubTournament.findFirst.mockResolvedValue({
        id: 't1',
        days: [{ date: future(5), start: '09:00', end: '18:00' }],
        venues: [{ name: 'Sede' }],
        endDate: future(5),
        publishedAt: null,
      });
      await service.setStatus('company-a', 'club-a', 't1', 'PUBLISHED');
      expect(prisma.clubTournament.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
      });
      // Fluxion le cobra al club la publicación.
      expect(platform.chargeTournamentPublished).toHaveBeenCalledWith(
        expect.objectContaining({ clubId: 'club-a', tournamentId: 't1' }),
      );
    });

    it('does not accept entries beyond the limit', async () => {
      prisma.clubTournament.findFirst.mockResolvedValue({
        ...published,
        maxEntries: 2,
      });
      prisma.tournamentEntry.findFirst.mockResolvedValue({
        id: 'e3',
        status: 'PENDING',
      });
      prisma.tournamentEntry.count.mockResolvedValue(2);
      await expect(
        service.reviewEntry('company-a', 'club-a', 't1', 'e3', {
          status: 'ACCEPTED',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('Fluxion charges', () => {
    it('charges a confirmed entry and voids it when the club undoes it', async () => {
      prisma.clubTournament.findFirst.mockResolvedValue({
        ...published,
        name: 'Copa',
      });
      prisma.tournamentEntry.findFirst.mockResolvedValue({
        id: 'e1',
        status: 'PENDING',
        teamName: 'Los Pibes',
        user: { name: 'Ana', email: 'a@b' },
      });
      await service.reviewEntry('company-a', 'club-a', 't1', 'e1', {
        status: 'ACCEPTED',
      });
      expect(platform.chargeEntryAccepted).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: 'e1',
          entryName: 'Los Pibes',
          tournamentName: 'Copa',
        }),
      );

      prisma.tournamentEntry.findFirst.mockResolvedValue({
        id: 'e1',
        status: 'ACCEPTED',
        teamName: 'Los Pibes',
        user: { name: 'Ana', email: 'a@b' },
      });
      await service.reviewEntry('company-a', 'club-a', 't1', 'e1', {
        status: 'REJECTED',
      });
      expect(platform.voidEntryCharge).toHaveBeenCalledWith('e1');
    });

    it('voids the charge when the player cancels', async () => {
      await service.cancelMyEntry('fb-ana', 'e1');
      expect(platform.voidEntryCharge).toHaveBeenCalledWith('e1');
    });
  });

  describe('entries from the app', () => {
    it('signs up a team while registration is open', async () => {
      await expect(
        service.createEntry('fb-ana', {
          tournamentId: 't1',
          teamName: 'Los Pibes',
        }),
      ).resolves.toEqual({ id: 'e1', status: 'PENDING' });
      expect(prisma.tournamentEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-a',
            clubId: 'club-a',
            userId: 'u1',
            teamName: 'Los Pibes',
          }),
        }),
      );
    });

    it('requires a team name, a complete profile and free spots', async () => {
      await expect(
        service.createEntry('fb-ana', { tournamentId: 't1' }),
      ).rejects.toThrow('nombre del equipo');

      prisma.tournamentEntry.count.mockResolvedValue(8);
      await expect(
        service.createEntry('fb-ana', { tournamentId: 't1', teamName: 'X' }),
      ).rejects.toThrow('No quedan lugares');

      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Ana',
        phone: null,
      });
      await expect(
        service.createEntry('fb-ana', { tournamentId: 't1', teamName: 'X' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('turns a duplicate sign-up into a clear message', async () => {
      prisma.tournamentEntry.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        service.createEntry('fb-ana', { tournamentId: 't1', teamName: 'X' }),
      ).rejects.toThrow('Ya estás inscripto');
    });

    it('hides drafts from the app', async () => {
      prisma.clubTournament.findFirst.mockResolvedValue(null);
      await expect(service.getPublic('t-draft')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.clubTournament.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 't-draft',
            status: { in: ['PUBLISHED', 'CLOSED', 'FINISHED'] },
          }),
        }),
      );
    });
  });
});
