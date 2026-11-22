jest.mock('../push/push.service', () => ({ PushService: class {} }));

import { ConflictException } from '@nestjs/common';

import { TournamentBracketService } from './tournament-bracket.service';

type Row = Record<string, any>;

/** Base en memoria con lo justo para el cuadro. */
function fakeDb() {
  const teams: Row[] = [];
  const matches: Row[] = [];
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const matchWhere = (m: Row, where: Row = {}) =>
    (!where.tournamentId || m.tournamentId === where.tournamentId) &&
    (where.winnerId?.not === undefined || m.winnerId !== null) &&
    (where.teamAId?.not === undefined || m.teamAId !== null) &&
    (where.teamBId?.not === undefined || m.teamBId !== null) &&
    (!where.OR ||
      where.OR.some((c: Row) =>
        Object.entries(c).every(([k, v]) =>
          typeof v === 'object' && v && 'in' in v ? (v as any).in.includes(m[k]) : m[k] === v,
        ),
      ));
  const db = {
    teams,
    matches,
    clubTournament: {
      findFirst: jest.fn(async () => ({
        id: 't1',
        name: 'Copa Primavera',
        entryType: 'pareja',
        sport: 'padel',
        category: null,
        status: 'PUBLISHED',
        club: { name: 'Club Demo' },
      })),
    },
    player: {
      findMany: jest.fn(async ({ where }: Row) =>
        where.id.in.includes('pl-app') ? [{ authUid: 'uid-app' }] : [],
      ),
    },
    tournamentTeam: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: id('team'), seed: null, entryId: null, createdAt: n, ...data };
        teams.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: Row) =>
        teams.filter((t) =>
          where.id?.in ? where.id.in.includes(t.id) : t.tournamentId === where.tournamentId,
        ),
      ),
      findFirst: jest.fn(async ({ where }: Row) => teams.find((t) => t.id === where.id) ?? null),
    },
    tournamentMatch: {
      count: jest.fn(async ({ where }: Row) => matches.filter((m) => matchWhere(m, where)).length),
      deleteMany: jest.fn(async ({ where }: Row) => {
        for (let i = matches.length - 1; i >= 0; i--)
          if (matches[i].tournamentId === where.tournamentId) matches.splice(i, 1);
      }),
      createMany: jest.fn(async ({ data }: Row) => {
        for (const d of data)
          matches.push({ id: id('m'), date: null, startMinute: null, court: null, score: null, notifiedKey: null, notifiedAt: null, ...d });
      }),
      findMany: jest.fn(async ({ where }: Row) =>
        matches
          .filter((m) => matchWhere(m, where))
          .sort((a, b) => a.round - b.round || a.position - b.position),
      ),
      update: jest.fn(async ({ where, data }: Row) => {
        const m = matches.find((x) => x.id === where.id)!;
        Object.assign(m, data);
        return { ...m };
      }),
      aggregate: jest.fn(async () => ({
        _max: { round: Math.max(...matches.map((m) => m.round)) },
      })),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return db;
}

describe('TournamentBracketService', () => {
  const setup = async (count = 4) => {
    const db = fakeDb();
    const push = { notifyUsers: jest.fn(async (uids: string[]) => ({ sent: uids.length })) };
    const service = new TournamentBracketService(db as never, push as never);
    for (let i = 1; i <= count; i++)
      await service.addTeam('co', 'cl', 't1', {
        players: [
          { name: `Jugador ${i}A`, playerId: i === 1 ? 'pl-app' : null },
          { name: `Jugador ${i}B` },
        ],
      });
    return { db, push, service };
  };

  it('carga parejas a mano y arma el nombre', async () => {
    const { db } = await setup(1);
    expect(db.teams[0]).toMatchObject({
      name: 'Jugador 1A / Jugador 1B',
      notifyUids: ['uid-app'],
    });
  });

  it('arma el cuadro, avanza ganadores y define campeón', async () => {
    const { service } = await setup(4);
    let view = await service.generate('co', 'cl', 't1', {});
    expect(view.rounds.map((r) => r.name)).toEqual(['Semifinal', 'Final']);
    const [s1, s2] = view.rounds[0].matches;
    view = await service.updateMatch('co', 'cl', 't1', s1.id, { winnerId: s1.teamA!.id, score: '6-3 6-4' });
    view = await service.updateMatch('co', 'cl', 't1', s2.id, { winnerId: s2.teamB!.id });
    const final = view.rounds[1].matches[0];
    expect(final.teamA?.id).toBe(s1.teamA!.id);
    expect(final.teamB?.id).toBe(s2.teamB!.id);
    view = await service.updateMatch('co', 'cl', 't1', final.id, { winnerId: final.teamB!.id });
    expect(view.champion?.id).toBe(s2.teamB!.id);
  });

  it('no deja cambiar un resultado si el partido siguiente ya se jugó', async () => {
    const { service } = await setup(4);
    const view = await service.generate('co', 'cl', 't1', {});
    const [s1, s2] = view.rounds[0].matches;
    await service.updateMatch('co', 'cl', 't1', s1.id, { winnerId: s1.teamA!.id });
    await service.updateMatch('co', 'cl', 't1', s2.id, { winnerId: s2.teamA!.id });
    const final = (await service.view('co', 'cl', 't1')).rounds[1].matches[0];
    await service.updateMatch('co', 'cl', 't1', final.id, { winnerId: final.teamA!.id });
    await expect(
      service.updateMatch('co', 'cl', 't1', s1.id, { winnerId: s1.teamB!.id }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('avisa día y hora a los que tienen la app, y vuelve a avisar si cambia', async () => {
    const { service, push } = await setup(4);
    const view = await service.generate('co', 'cl', 't1', {});
    const withApp = view.rounds[0].matches.find(
      (m) => m.teamA?.name.startsWith('Jugador 1A') || m.teamB?.name.startsWith('Jugador 1A'),
    )!;
    let next = await service.updateMatch('co', 'cl', 't1', withApp.id, {
      date: '2026-11-28',
      startMinute: 18 * 60,
      court: 'Cancha 1',
    });
    expect(next.pendingNotices).toBe(1);
    const sent = await service.notifyPending('co', 'cl', 't1');
    expect(sent.players).toBe(1);
    expect(push.notifyUsers).toHaveBeenCalledWith(
      ['uid-app'],
      expect.objectContaining({ body: expect.stringContaining('sáb 28/11 18:00 · Cancha 1') }),
    );
    expect(sent.pendingNotices).toBe(0);
    next = await service.updateMatch('co', 'cl', 't1', withApp.id, { startMinute: 19 * 60 });
    expect(next.pendingNotices).toBe(1);
  });

  it('pide confirmación para rehacer un cuadro con resultados', async () => {
    const { service } = await setup(4);
    const view = await service.generate('co', 'cl', 't1', {});
    const s1 = view.rounds[0].matches[0];
    await service.updateMatch('co', 'cl', 't1', s1.id, { winnerId: s1.teamA!.id });
    await expect(service.generate('co', 'cl', 't1', {})).rejects.toBeInstanceOf(ConflictException);
    await expect(service.generate('co', 'cl', 't1', { force: true })).resolves.toBeTruthy();
  });
});
