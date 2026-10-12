import { ForbiddenException } from '@nestjs/common';

jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class FirebaseAdminService {},
}));

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService.provisionProfileClaims', () => {
  const actor = { uid: 'actor-auth-uid', companyId: 'company-a', clubId: 'club-a' };
  const actorUser = { id: 'actor-db-id', role: 'user', companyId: 'company-a' };
  const targetAuthUser = { uid: 'target-auth-uid', email: 'target@example.test', displayName: 'Target User' };
  const targetDbUser = { id: 'target-db-id', firebaseUid: targetAuthUser.uid };
  let prisma: any;
  let firebaseAdmin: any;
  let service: UsersService;

  beforeEach(() => {
    const transaction = {
      user: { upsert: jest.fn().mockResolvedValue(targetDbUser) },
      clubMembership: { upsert: jest.fn().mockResolvedValue({ id: 'membership-id' }) },
    };

    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(actorUser),
        findUnique: jest.fn().mockResolvedValue({
          id: targetDbUser.id,
          email: targetAuthUser.email,
          name: targetAuthUser.displayName,
          companyId: 'company-a',
        }),
      },
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'company-a' }) },
      club: { findUnique: jest.fn().mockResolvedValue({ id: 'club-a', companyId: 'company-a' }) },
      clubMembership: { findFirst: jest.fn().mockResolvedValue({ id: 'actor-membership-id' }) },
      $transaction: jest.fn((callback) => callback(transaction)),
      transaction,
    };
    firebaseAdmin = {
      auth: {
        getUser: jest.fn().mockResolvedValue(targetAuthUser),
        setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      },
    };
    service = new UsersService(prisma as PrismaService, firebaseAdmin as FirebaseAdminService);
  });

  it('creates a club membership and derives role claims from the persisted profile', async () => {
    await service.provisionProfileClaims({
      uid: targetAuthUser.uid,
      role: 'coach',
      companyId: 'company-a',
      clubId: 'club-a',
    }, actor);

    expect(prisma.transaction.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { firebaseUid: targetAuthUser.uid },
      create: expect.objectContaining({ role: 'user', companyId: 'company-a' }),
    }));
    expect(prisma.transaction.clubMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_clubId: { userId: targetDbUser.id, clubId: 'club-a' } },
      create: expect.objectContaining({
        userId: targetDbUser.id,
        companyId: 'company-a',
        clubId: 'club-a',
        status: 'ACTIVA',
        role: 'coach',
      }),
    }));
    expect(firebaseAdmin.auth.setCustomUserClaims).toHaveBeenCalledWith(targetAuthUser.uid, {
      email: targetAuthUser.email,
      name: targetAuthUser.displayName,
      role: 'coach',
      roles: ['coach'],
      companyId: 'company-a',
      clubId: 'club-a',
    });
  });

  it('updates both the persisted membership role and custom claims', async () => {
    await service.provisionProfileClaims({
      uid: targetAuthUser.uid,
      role: 'member',
      companyId: 'company-a',
      clubId: 'club-a',
    }, actor);

    expect(prisma.transaction.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ role: 'user', companyId: 'company-a' }),
    }));
    expect(prisma.transaction.clubMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'ACTIVA', role: 'member' }),
    }));
    expect(firebaseAdmin.auth.setCustomUserClaims).toHaveBeenCalledWith(targetAuthUser.uid, expect.objectContaining({
      role: 'member',
      roles: ['member'],
      isFan: true,
    }));
  });

  it('rejects a club-scoped role in another club before updating Firebase claims', async () => {
    prisma.club.findUnique.mockResolvedValue({ id: 'club-b', companyId: 'company-a' });

    await expect(service.provisionProfileClaims({
      uid: targetAuthUser.uid,
      role: 'coach',
      companyId: 'company-a',
      clubId: 'club-b',
    }, actor)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(firebaseAdmin.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects a club whose company differs from the requested tenant', async () => {
    prisma.club.findUnique.mockResolvedValue({ id: 'club-b', companyId: 'company-b' });

    await expect(service.provisionProfileClaims({
      uid: targetAuthUser.uid,
      role: 'coach',
      companyId: 'company-a',
      clubId: 'club-b',
    }, actor)).rejects.toThrow('Club does not belong to the requested company');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(firebaseAdmin.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('switches claims after validating an active membership in the requested club', async () => {
    prisma.clubMembership.findFirst.mockResolvedValue({
      companyId: 'company-a',
      clubId: 'club-b',
      role: 'coach',
      club: { companyId: 'company-a' },
    });

    await expect(service.switchActiveClub(targetAuthUser.uid, 'club-b')).resolves.toEqual({
      ok: true,
      companyId: 'company-a',
      clubId: 'club-b',
      role: 'coach',
    });
    expect(prisma.clubMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: targetDbUser.id,
        clubId: 'club-b',
        status: 'ACTIVA',
      }),
    }));
    expect(firebaseAdmin.auth.setCustomUserClaims).toHaveBeenCalledWith(targetAuthUser.uid, expect.objectContaining({
      companyId: 'company-a',
      clubId: 'club-b',
      role: 'coach',
      roles: ['coach'],
    }));
  });

  it('lets a free user (no company) switch into a club where the membership is active', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...targetDbUser, companyId: null });
    prisma.clubMembership.findFirst.mockResolvedValue({
      companyId: 'company-b',
      clubId: 'club-x',
      role: 'member',
      club: { companyId: 'company-b' },
    });

    await expect(service.switchActiveClub(targetAuthUser.uid, 'club-x')).resolves.toEqual(
      expect.objectContaining({ ok: true, companyId: 'company-b', clubId: 'club-x', role: 'member' }),
    );
  });

  it('rejects switching when the membership company does not match the club company', async () => {
    prisma.clubMembership.findFirst.mockResolvedValue({
      companyId: 'company-a',
      clubId: 'club-b',
      role: 'coach',
      club: { companyId: 'company-z' },
    });

    await expect(service.switchActiveClub(targetAuthUser.uid, 'club-b')).rejects.toThrow('Active club membership required');
    expect(firebaseAdmin.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('does not change claims when the target club has no active membership', async () => {
    prisma.clubMembership.findFirst.mockResolvedValue(null);

    await expect(service.switchActiveClub(targetAuthUser.uid, 'club-b')).rejects.toBeInstanceOf(ForbiddenException);
    expect(firebaseAdmin.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});