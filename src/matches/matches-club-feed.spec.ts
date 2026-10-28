import { MatchesService } from './matches.service';

describe('MatchesService.clubFeed', () => {
  it('filtra por club (local o visitante) y separa en vivo, próximos y recientes', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new MatchesService({ match: { findMany } } as never);

    const res = await service.clubFeed('co1', 'club1');

    expect(res).toEqual({ live: [], upcoming: [], recent: [] });
    expect(findMany).toHaveBeenCalledTimes(3);
    const [live, upcoming, recent] = findMany.mock.calls.map((c) => c[0]);
    for (const q of [live, upcoming, recent]) {
      expect(q.where.companyId).toBe('co1');
      expect(q.where.OR).toEqual([{ homeTeam: { clubId: 'club1' } }, { awayTeam: { clubId: 'club1' } }]);
    }
    expect(live.where.status).toBe('live');
    expect(upcoming.where.status).toBe('scheduled');
    expect(upcoming.orderBy).toEqual({ scheduledAt: 'asc' });
    expect(recent.where.status).toBe('played');
  });
});
