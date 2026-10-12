import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { JoinRequestsService } from './join-requests.service';

describe('JoinRequestsService', () => {
  let prisma: any;
  let tx: any;
  let service: JoinRequestsService;
  const pending = {
    id: 'req-1',
    role: 'member',
    user: { firebaseUid: 'free-uid', email: 'Ana@Mail.com' },
  };

  beforeEach(() => {
    tx = {
      player: { findFirst: jest.fn(), update: jest.fn() },
      member: { findFirst: jest.fn(), update: jest.fn() },
      clubMembership: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'req-1', status: 'ACTIVA' }),
      },
    };
    prisma = {
      club: { findFirst: jest.fn().mockResolvedValue({ id: 'club-a' }) },
      clubMembership: {
        findFirst: jest.fn().mockResolvedValue(pending),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'reviewer-id' }) },
      player: { findMany: jest.fn().mockResolvedValue([]) },
      member: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    service = new JoinRequestsService(prisma);
  });

  it('scopes pending requests to company and club', async () => {
    await service.approve('company-a', 'club-a', 'req-1', 'reviewer-uid', {});
    expect(prisma.clubMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'req-1',
          companyId: 'company-a',
          clubId: 'club-a',
          status: 'SOLICITADA',
        },
      }),
    );
  });

  it('approves and links an existing player record of the same club', async () => {
    tx.player.findFirst.mockResolvedValue({ id: 'player-1', authUid: null });

    await service.approve('company-a', 'club-a', 'req-1', 'reviewer-uid', {
      playerId: 'player-1',
      role: 'player',
    });

    expect(tx.player.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'player-1', companyId: 'company-a', clubId: 'club-a' },
      }),
    );
    expect(tx.player.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: { authUid: 'free-uid' },
    });
    expect(tx.clubMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req-1', status: 'SOLICITADA' },
        data: expect.objectContaining({
          status: 'ACTIVA',
          role: 'player',
          playerId: 'player-1',
          reviewedByUserId: 'reviewer-id',
        }),
      }),
    );
  });

  it('refuses to link a record already bound to another account', async () => {
    tx.member.findFirst.mockResolvedValue({
      id: 'member-1',
      authUid: 'someone-else',
    });
    await expect(
      service.approve('company-a', 'club-a', 'req-1', 'reviewer-uid', {
        memberId: 'member-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.clubMembership.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to link a record from another club', async () => {
    tx.player.findFirst.mockResolvedValue(null);
    await expect(
      service.approve('company-a', 'club-a', 'req-1', 'reviewer-uid', {
        playerId: 'player-of-club-b',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects linking to both a player and a member at once', async () => {
    await expect(
      service.approve('company-a', 'club-a', 'req-1', 'reviewer-uid', {
        playerId: 'p',
        memberId: 'm',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not overwrite a request resolved concurrently', async () => {
    tx.clubMembership.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.approve('company-a', 'club-a', 'req-1', 'reviewer-uid', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 when there is no pending request', async () => {
    prisma.clubMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.reject('company-a', 'club-a', 'req-x', 'reviewer-uid', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects with a reason visible to the requester', async () => {
    prisma.clubMembership.updateMany.mockResolvedValue({ count: 1 });
    await service.reject('company-a', 'club-a', 'req-1', 'reviewer-uid', {
      reason: 'Cupo completo',
    });
    expect(prisma.clubMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RECHAZADA',
          message: 'Cupo completo',
        }),
      }),
    );
  });

  it('suggests only unlinked records of the same club matching the email', async () => {
    await service.candidates('company-a', 'club-a', 'req-1');
    const where = prisma.player.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        companyId: 'company-a',
        clubId: 'club-a',
        authUid: null,
      }),
    );
    expect(where.email).toEqual({
      equals: 'ana@mail.com',
      mode: 'insensitive',
    });
  });
});
