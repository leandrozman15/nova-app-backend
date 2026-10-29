import { fixtureInstant, loadFixtureFeed } from './club-feed-fixture';

describe('fixtureInstant', () => {
  it('interpreta la hora del club como -03:00 y respeta zonas explícitas', () => {
    expect(fixtureInstant('2026-11-07T17:30')).toBe('2026-11-07T20:30:00.000Z');
    expect(fixtureInstant('2026-11-07')).toBe('2026-11-07T03:00:00.000Z');
    expect(fixtureInstant('2026-11-07T17:30:00Z')).toBe('2026-11-07T17:30:00.000Z');
    expect(fixtureInstant('')).toBeNull();
    expect(fixtureInstant('no es fecha')).toBeNull();
  });
});

describe('loadFixtureFeed', () => {
  const NOW = Date.parse('2026-11-05T12:00:00Z');
  const row = (parentPath: string, docId: string, data: Record<string, unknown>) => ({ parentPath, collection: parentPath.split('/').at(-1)!, docId, data });
  const base = 'clubs/c1/tournaments';

  const docs = [
    row(base, 't1', { name: 'Apertura Infantil' }),
    row('clubs/c1/opponents', 'o9', { name: 'Lomas Athletic', address: 'Calle 9 1234', city: 'Lomas', coverUrl: 'portada.jpg', logoUrl: 'escudo.png' }),
    row(`${base}/t1/standings`, 's1', { teamId: 'o9', teamName: 'Lomas Athletic', points: 7, played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 6, goalsAgainst: 2 }),
    row(`${base}/t1/standings`, 's2', { teamId: 'c1', teamName: 'Mi club', points: 3, played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 3, goalsAgainst: 5 }),
    row(`${base}/t1/matches`, 'm1', { homeParticipantId: 'o9', awayParticipantId: 'c1', homeParticipantName: 'Lomas Athletic', awayParticipantName: 'Mi club', date: '2026-11-07T17:30', status: 'scheduled', round: 4 }),
    row(`${base}/t1/matches`, 'm2', { homeParticipantId: 'c1', awayParticipantId: 'o9', homeParticipantName: 'Mi club', awayParticipantName: 'Lomas Athletic', date: '2026-10-20T10:00', status: 'played', homeScore: 1, awayScore: 2 }),
    row(`${base}/t1/matches`, 'm3', { homeParticipantId: 'c1', awayParticipantId: 'o9', homeParticipantName: 'Mi club', awayParticipantName: 'Lomas Athletic', date: '', status: 'scheduled' }),
    row(`${base}/t1/matches`, 'm4', { homeParticipantId: 'x', awayParticipantId: 'y', homeParticipantName: 'A', awayParticipantName: 'B', date: '2026-11-08T10:00', status: 'scheduled' }),
    row(`${base}/t1/matches`, 'm5', { homeParticipantId: 'c1', awayParticipantId: 'o9', homeParticipantName: 'Mi club', awayParticipantName: 'Lomas Athletic', date: '2026-11-09T10:00', status: 'suspended' }),
  ];
  const prisma = {
    storeDocument: { findMany: jest.fn().mockResolvedValue(docs) },
    club: { findFirst: jest.fn().mockResolvedValue({ name: 'Mi Club SA', logoUrl: null, coverUrl: null, address: 'Av. Siempreviva 742', city: 'Springfield', latitude: null, longitude: null }) },
  };

  it('suma al feed los partidos del fixture del club con la ficha del rival y su posición', async () => {
    const feed = await loadFixtureFeed(prisma as never, 'co1', 'c1', NOW);
    expect(feed.upcoming).toHaveLength(1);
    const m = feed.upcoming[0];
    expect(m).toMatchObject({ id: 'fx:t1:m1', scheduledAt: '2026-11-07T20:30:00.000Z', round: 4, tournament: { id: 't1', name: 'Apertura Infantil' } });
    expect(m.rival).toMatchObject({ name: 'Lomas Athletic', coverUrl: 'portada.jpg', logoUrl: 'escudo.png', address: 'Calle 9 1234', standing: { position: 1, total: 2, points: 7 } });
    // Juega de local el rival: la sede es la del rival.
    expect(m.place).toMatchObject({ name: 'Lomas Athletic', address: 'Calle 9 1234' });
    expect(feed.recent.map((x) => x.id)).toEqual(['fx:t1:m2']);
    expect(feed.recent[0]).toMatchObject({ status: 'played', homeScore: 1, awayScore: 2 });
    // Sin fecha, ajenos al club y suspendidos no aparecen.
    expect(feed.live).toEqual([]);
  });

  it('si el club juega de local, la sede es la del club', async () => {
    const withHome = [row(`${base}/t1/matches`, 'h1', { homeParticipantId: 'c1', awayParticipantId: 'o9', homeParticipantName: 'Mi club', awayParticipantName: 'Lomas Athletic', date: '2026-11-07T17:30', status: 'scheduled' })];
    const p = { ...prisma, storeDocument: { findMany: jest.fn().mockResolvedValue([...docs.slice(0, 4), ...withHome]) } };
    const feed = await loadFixtureFeed(p as never, 'co1', 'c1', NOW);
    expect(feed.upcoming[0].place).toMatchObject({ name: 'Mi Club SA', address: 'Av. Siempreviva 742' });
  });

  it('sin documentos devuelve vacío y no consulta el club', async () => {
    const p = { storeDocument: { findMany: jest.fn().mockResolvedValue([]) }, club: { findFirst: jest.fn() } };
    expect(await loadFixtureFeed(p as never, 'co1', 'c1', NOW)).toEqual({ live: [], upcoming: [], recent: [] });
    expect(p.club.findFirst).not.toHaveBeenCalled();
  });
});
