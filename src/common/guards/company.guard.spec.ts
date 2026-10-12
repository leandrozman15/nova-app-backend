import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { requireClubScope } from '../http/request-context';
import { CompanyGuard } from './company.guard';

function contextFor(request: any) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

describe('CompanyGuard', () => {
  const reflectorWith = (flags: Record<string, boolean>) => ({
    getAllAndOverride: jest.fn((key: string) => flags[key] ?? false),
  });

  it('lets @NoTenant endpoints through without a company header', () => {
    const guard = new CompanyGuard(reflectorWith({ noTenant: true }) as any);
    const request = {
      headers: {},
      url: '/users/me/join-requests',
      auth: { uid: 'free' },
    };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('still requires a company for regular endpoints', () => {
    const guard = new CompanyGuard(reflectorWith({}) as any);
    const request = { headers: {}, url: '/clubs', auth: { uid: 'free' } };
    expect(() => guard.canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('requireClubScope', () => {
  it('allows company-wide roles on any club of the tenant', () => {
    expect(() =>
      requireClubScope({ auth: { uid: 'u', role: 'admin' } }, 'club-b'),
    ).not.toThrow();
  });

  it('restricts club roles to their active club', () => {
    expect(() =>
      requireClubScope(
        { auth: { uid: 'u', role: 'club_admin', clubId: 'club-a' } },
        'club-a',
      ),
    ).not.toThrow();
    expect(() =>
      requireClubScope(
        { auth: { uid: 'u', role: 'club_admin', clubId: 'club-a' } },
        'club-b',
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      requireClubScope({ auth: { uid: 'u', role: 'manager' } }, 'club-a'),
    ).toThrow(ForbiddenException);
  });
});
