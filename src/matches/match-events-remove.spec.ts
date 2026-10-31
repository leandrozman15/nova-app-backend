import { MatchesService } from './matches.service';

describe('MatchesService.removeEventByMatch', () => {
  const build = (found: unknown) => {
    const prisma: any = {
      match: { findFirst: jest.fn().mockResolvedValue({ id: 'm1' }) },
      matchEvent: { findFirst: jest.fn().mockResolvedValue(found), delete: jest.fn().mockResolvedValue({}) },
    };
    return { prisma, service: new MatchesService(prisma) };
  };

  it('borra la incidencia más reciente que coincide', async () => {
    const { prisma, service } = build({ id: 'e9' });
    const r = await service.removeEventByMatch('co', 'm1', { type: 'goal', minute: 5, note: 'GOAL - Ana' });
    expect(r).toEqual({ ok: true, removed: 1 });
    expect(prisma.matchEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'co', matchId: 'm1', type: 'goal', minute: 5, note: 'GOAL - Ana' }, orderBy: { createdAt: 'desc' } }),
    );
    expect(prisma.matchEvent.delete).toHaveBeenCalledWith({ where: { id: 'e9' } });
  });

  it('si no hay coincidencia no borra nada', async () => {
    const { prisma, service } = build(null);
    expect(await service.removeEventByMatch('co', 'm1', { type: 'yellow_card' })).toEqual({ ok: true, removed: 0 });
    expect(prisma.matchEvent.delete).not.toHaveBeenCalled();
  });
});
