import { ForbiddenException } from '@nestjs/common';

import { LeagueScopeGuard } from './league-scope.guard';

const ctx = (auth: object, id?: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ auth, companyId: 'c1', params: { id } }) }) }) as never;

describe('LeagueScopeGuard', () => {
  const findFirst = jest.fn();
  const guard = new LeagueScopeGuard({ league: { findFirst } } as never);

  beforeEach(() => findFirst.mockReset());

  it('deja pasar a quien no tiene leagueId en el token', async () => {
    await expect(guard.canActivate(ctx({ role: 'admin' }, 'x'))).resolves.toBe(true);
  });

  it('permite la propia liga y sus sub-ligas', async () => {
    await expect(guard.canActivate(ctx({ leagueId: 'L1' }, 'L1'))).resolves.toBe(true);
    findFirst.mockResolvedValue({ parentId: 'L1' });
    await expect(guard.canActivate(ctx({ leagueId: 'L1' }, 'S1'))).resolves.toBe(true);
  });

  it('rechaza ligas ajenas, incluso hermanas', async () => {
    findFirst.mockResolvedValue({ parentId: 'OTRA' });
    await expect(guard.canActivate(ctx({ leagueId: 'S1' }, 'S2'))).rejects.toBeInstanceOf(ForbiddenException);
    findFirst.mockResolvedValue({ parentId: null });
    await expect(guard.canActivate(ctx({ leagueId: 'S1' }, 'L9'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
