import { ForbiddenException } from '@nestjs/common';

import { MatchSuspensionsService } from './match-suspensions.service';

const match = (over: object = {}) => ({
  id: 'm1',
  status: 'scheduled',
  scheduledAt: new Date('2026-11-01T15:00:00Z'),
  originalScheduledAt: null,
  homeTeam: { id: 't1', name: 'A', clubId: 'cA' },
  awayTeam: { id: 't2', name: 'B', clubId: 'cB' },
  suspensions: [],
  ...over,
});

function setup(found: object) {
  const prisma = {
    match: { findFirst: jest.fn().mockResolvedValue(found), update: jest.fn((x) => x) },
    matchSuspension: { create: jest.fn((x) => x), update: jest.fn((x) => x) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return { prisma, service: new MatchSuspensionsService(prisma as never) };
}
const req = (auth: object) => ({ auth }) as never;

describe('MatchSuspensionsService', () => {
  it('un club ajeno no puede suspender', async () => {
    const { service } = setup(match());
    await expect(service.suspend('c', 'm1', { reason: 'Lluvia fuerte' }, req({ role: 'manager', clubId: 'cX' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('suspensión total deja el partido suspendido', async () => {
    const { service, prisma } = setup(match());
    await service.suspend('c', 'm1', { reason: 'Lluvia fuerte' }, req({ role: 'manager', clubId: 'cA' }));
    expect(prisma.match.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'suspended' } });
    expect(prisma.matchSuspension.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clubId: 'cA', categories: [], reason: 'Lluvia fuerte' }),
    });
  });

  it('suspensión parcial no cambia el estado del partido', async () => {
    const { service, prisma } = setup(match());
    await service.suspend('c', 'm1', { reason: 'Faltan jugadores', categories: ['Sub 14'] }, req({ role: 'manager', clubId: 'cB' }));
    expect(prisma.match.update).not.toHaveBeenCalled();
  });

  it('reprogramar una suspensión total mueve el partido y guarda la fecha original', async () => {
    const open = { id: 's1', state: 'open', categories: [], clubId: 'cB' };
    const { service, prisma } = setup(match({ status: 'suspended', suspensions: [open] }));
    const newDate = new Date(Date.now() + 5 * 86400000);
    await service.reschedule('c', 'm1', 's1', { newDate }, req({ role: 'manager', clubId: 'cA' }));
    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { status: 'scheduled', scheduledAt: newDate, originalScheduledAt: new Date('2026-11-01T15:00:00Z') },
    });
  });

  it('el visitante no puede reprogramar', async () => {
    const open = { id: 's1', state: 'open', categories: [], clubId: 'cB' };
    const { service } = setup(match({ status: 'suspended', suspensions: [open] }));
    await expect(
      service.reschedule('c', 'm1', 's1', { newDate: new Date(Date.now() + 86400000) }, req({ role: 'manager', clubId: 'cB' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
