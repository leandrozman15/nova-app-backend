import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const requiredRoles = ['coach', 'club_admin'];
  let prisma: any;
  let reflector: any;
  let guard: RolesGuard;

  function contextFor(request: any) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
  }

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-db-id', role: 'user' }) },
      clubMembership: { findFirst: jest.fn() },
    };
    reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === 'isPublic') return false;
        return requiredRoles;
      }),
    };
    guard = new RolesGuard(reflector, prisma);
  });

  it('uses the active club membership role instead of the generic User role', async () => {
    prisma.clubMembership.findFirst.mockResolvedValue({ role: 'coach' });
    const request = {
      auth: { uid: 'firebase-uid', companyId: 'company-a', clubId: 'club-a', role: 'member' },
      companyId: 'company-a',
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(prisma.clubMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-db-id', companyId: 'company-a', clubId: 'club-a', status: 'ACTIVA' }),
    }));
    expect(request.auth.role).toBe('coach');
  });

  it('evaluates roles against the requested club membership, not another club role', async () => {
    prisma.clubMembership.findFirst.mockImplementation(({ where }: any) =>
      where.clubId === 'club-a' ? { role: 'coach' } : { role: 'member' },
    );
    const request = {
      auth: { uid: 'firebase-uid', companyId: 'company-a', clubId: 'club-b' },
      companyId: 'company-a',
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ForbiddenException);
    expect(request.auth.role).toBe('member');
  });

  it('rejects a missing active-club claim for a non-global user', async () => {
    const request = {
      auth: { uid: 'firebase-uid', companyId: 'company-a' },
      companyId: 'company-a',
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps global roles sourced from the persisted user without requiring a club membership', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'platform-user', role: 'admin', companyId: 'company-a' });
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === 'isPublic' ? false : ['admin'],
    );
    const request = {
      auth: { uid: 'firebase-uid', companyId: 'company-a' },
      companyId: 'company-a',
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(prisma.clubMembership.findFirst).not.toHaveBeenCalled();
  });

  it('does not honor a global role outside the user own company', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'platform-user', role: 'admin', companyId: 'company-a' });
    prisma.clubMembership.findFirst.mockResolvedValue(null);
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === 'isPublic' ? false : ['admin'],
    );
    const request = {
      auth: { uid: 'firebase-uid', companyId: 'company-b', clubId: 'club-b' },
      companyId: 'company-b',
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('authorizes a free user (no company) through an active membership in the tenant', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'free-user', role: 'user', companyId: null });
    prisma.clubMembership.findFirst.mockResolvedValue({ role: 'coach' });
    const request = {
      auth: { uid: 'firebase-uid', companyId: 'company-a', clubId: 'club-a' },
      companyId: 'company-a',
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(prisma.clubMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'free-user', companyId: 'company-a', clubId: 'club-a', status: 'ACTIVA' }),
    }));
  });

  it('rejects a free user without an active membership', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'free-user', role: 'user', companyId: null });
    prisma.clubMembership.findFirst.mockResolvedValue(null);
    const request = {
      auth: { uid: 'firebase-uid', companyId: 'company-a', clubId: 'club-a' },
      companyId: 'company-a',
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('legacy membership backfill', () => {
    const legacyRequest = () => ({
      auth: { uid: 'firebase-uid', companyId: 'company-a', clubId: 'club-a', role: 'club_admin' },
      companyId: 'company-a',
    });

    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue({ id: 'staff', role: 'user', companyId: 'company-a' });
      prisma.clubMembership.findFirst.mockResolvedValue(null);
      prisma.clubMembership.findUnique = jest.fn().mockResolvedValue(null);
      prisma.clubMembership.create = jest.fn().mockResolvedValue({ role: 'club_admin' });
      prisma.club = { findFirst: jest.fn().mockResolvedValue({ id: 'club-a' }) };
    });

    it('creates the active membership from signed claims of a pre-existing club user', async () => {
      await expect(guard.canActivate(contextFor(legacyRequest()))).resolves.toBe(true);
      expect(prisma.club.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'club-a', companyId: 'company-a' } }));
      expect(prisma.clubMembership.create).toHaveBeenCalledWith(expect.objectContaining({
        data: { userId: 'staff', companyId: 'company-a', clubId: 'club-a', role: 'club_admin', status: 'ACTIVA' },
      }));
    });

    it('never reactivates an existing (rejected, removed or pending) membership', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ id: 'old' });
      await expect(guard.canActivate(contextFor(legacyRequest()))).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.clubMembership.create).not.toHaveBeenCalled();
    });

    it('does not apply to free users, other companies, foreign clubs or header-only tenants', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'free', role: 'user', companyId: null });
      await expect(guard.canActivate(contextFor(legacyRequest()))).rejects.toBeInstanceOf(ForbiddenException);

      prisma.user.findFirst.mockResolvedValue({ id: 'staff', role: 'user', companyId: 'company-a' });
      prisma.club.findFirst.mockResolvedValue(null);
      await expect(guard.canActivate(contextFor(legacyRequest()))).rejects.toBeInstanceOf(ForbiddenException);

      prisma.club.findFirst.mockResolvedValue({ id: 'club-a' });
      const headerOnly = { auth: { uid: 'firebase-uid', clubId: 'club-a', role: 'club_admin' }, companyId: 'company-a' };
      await expect(guard.canActivate(contextFor(headerOnly))).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.clubMembership.create).not.toHaveBeenCalled();
    });

    it('ignores claim roles that are not club roles', async () => {
      const request = legacyRequest();
      request.auth.role = 'admin';
      await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.clubMembership.create).not.toHaveBeenCalled();
    });
  });
});
