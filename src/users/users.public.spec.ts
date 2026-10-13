import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class FirebaseAdminService {},
}));

import { UsersService } from './users.service';

describe('UsersService (usuario libre)', () => {
  let prisma: any;
  let firebaseAdmin: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-user' }),
        update: jest.fn(),
      },
      club: { findFirst: jest.fn() },
      clubMembership: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'm-1', status: 'SOLICITADA' }),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    firebaseAdmin = {
      auth: {
        getUser: jest
          .fn()
          .mockResolvedValue({
            uid: 'free-uid',
            email: 'ana@mail.com',
            displayName: 'Ana',
          }),
        setCustomUserClaims: jest.fn(),
      },
    };
    service = new UsersService(prisma, firebaseAdmin);
  });

  describe('registerFreeUser', () => {
    it('creates a global user without company and without role claims', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.registerFreeUser('free-uid', {});

      expect(result.created).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firebaseUid: 'free-uid',
            email: 'ana@mail.com',
            role: 'user',
            companyId: null,
          }),
        }),
      );
      expect(firebaseAdmin.auth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('is idempotent and never downgrades an existing staff profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'staff',
        role: 'admin',
        companyId: 'company-a',
      });

      const result = await service.registerFreeUser('staff-uid', {});

      expect(result.created).toBe(false);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects an email already used by another profile', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // por firebaseUid
        .mockResolvedValueOnce({ id: 'other' }); // por email
      await expect(
        service.registerFreeUser('free-uid', {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createJoinRequest', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'free-user',
        companyId: null,
      });
    });

    it('requires a registered profile', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.createJoinRequest('x', { clubId: 'club-a', role: 'member' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('only allows requests to public clubs', async () => {
      prisma.club.findFirst.mockResolvedValue(null);
      await expect(
        service.createJoinRequest('free-uid', {
          clubId: 'private',
          role: 'member',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.club.findFirst.mock.calls[0][0].where).toEqual({
        id: 'private',
        isPublic: true,
        NOT: {
          subscription: { is: { status: { in: ['SUSPENDED', 'CANCELLED'] } } },
        },
      });
    });

    it('creates a pending request in the club company', async () => {
      prisma.club.findFirst.mockResolvedValue({
        id: 'club-a',
        companyId: 'company-a',
      });

      await service.createJoinRequest('free-uid', {
        clubId: 'club-a',
        role: 'player',
        message: ' Hola ',
      });

      expect(prisma.clubMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: 'free-user',
            clubId: 'club-a',
            companyId: 'company-a',
            role: 'player',
            status: 'SOLICITADA',
            message: 'Hola',
          }),
        }),
      );
    });

    it('blocks duplicate pending or active links', async () => {
      prisma.club.findFirst.mockResolvedValue({
        id: 'club-a',
        companyId: 'company-a',
      });
      prisma.clubMembership.findUnique.mockResolvedValue({
        id: 'm',
        status: 'SOLICITADA',
      });
      await expect(
        service.createJoinRequest('free-uid', {
          clubId: 'club-a',
          role: 'member',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      prisma.clubMembership.findUnique.mockResolvedValue({
        id: 'm',
        status: 'ACTIVA',
      });
      await expect(
        service.createJoinRequest('free-uid', {
          clubId: 'club-a',
          role: 'member',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.clubMembership.upsert).not.toHaveBeenCalled();
    });

    it('lets a rejected user ask again and resets the previous review', async () => {
      prisma.club.findFirst.mockResolvedValue({
        id: 'club-a',
        companyId: 'company-a',
      });
      prisma.clubMembership.findUnique.mockResolvedValue({
        id: 'm',
        status: 'RECHAZADA',
      });

      await service.createJoinRequest('free-uid', {
        clubId: 'club-a',
        role: 'member',
      });

      expect(prisma.clubMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: 'SOLICITADA',
            reviewedAt: null,
            playerId: null,
            memberId: null,
          }),
        }),
      );
    });
  });

  it('cancels only own pending requests', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'free-user',
      companyId: null,
    });
    prisma.clubMembership.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      service.cancelJoinRequest('free-uid', 'm-other'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clubMembership.deleteMany).toHaveBeenCalledWith({
      where: { id: 'm-other', userId: 'free-user', status: 'SOLICITADA' },
    });
  });

  describe('profile', () => {
    const row = {
      id: 'u1',
      email: 'ana@mail.com',
      name: 'Ana',
      phone: null,
      city: null,
      sports: [],
      companyId: null,
    };

    it('reports an incomplete profile until it has name and phone', async () => {
      prisma.user.findUnique.mockResolvedValue(row);
      await expect(service.getMyProfile('free-uid')).resolves.toEqual(
        expect.objectContaining({ complete: false }),
      );
    });

    it('updates only the free user own fields and dedupes sports', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', companyId: null });
      prisma.user.update.mockResolvedValue({
        ...row,
        phone: '11 5555-1234',
        sports: ['padel'],
      });

      const result = await service.updateMyProfile('free-uid', {
        phone: '11 5555-1234',
        sports: ['padel', ' padel ', ''],
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { firebaseUid: 'free-uid' },
          data: { phone: '11 5555-1234', sports: ['padel'] },
        }),
      );
      expect(result.complete).toBe(true);
    });

    it('rejects unregistered users', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMyProfile('ghost', { phone: '11 5555-1234' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
