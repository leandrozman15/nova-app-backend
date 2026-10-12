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
    prisma.user.findFirst.mockResolvedValue({ id: 'platform-user', role: 'admin' });
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
});