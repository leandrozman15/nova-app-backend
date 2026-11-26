import { loadChildTeams } from './child-teams';

const row = (id: string, d: Record<string, unknown>) => ({
  path: `clubs/c1/divisions/d1/teams/${id}`,
  parentPath: 'clubs/c1/divisions/d1/teams',
  docId: id,
  companyId: 'co',
  data: d,
});

describe('loadChildTeams', () => {
  const child = (teamId?: string) => ({
    id: 'p1',
    companyId: 'co',
    clubId: 'c1',
    divisionId: 'd1',
    extra: teamId ? { teamId } : {},
  });
  const prisma = (rows: unknown[]) =>
    ({
      storeDocument: { findMany: jest.fn().mockResolvedValue(rows) },
    }) as never;

  it('junta a todos los entrenadores de la categoría, primero los de su plantel', async () => {
    const rows = [
      row('a', { name: 'A', coachName: 'Ana', assistantCoachName: 'Beto' }),
      row('b', { name: 'B', coachName: 'Carla', assistantCoachName: 'ana' }),
    ];
    const res = await loadChildTeams(prisma(rows), [child('b')]);
    expect(res.get('p1')).toMatchObject({
      id: 'b',
      coaches: ['Carla', 'ana', 'Beto'],
    });
  });

  it('conserva el nombre de cada entrenamiento', async () => {
    const rows = [
      row('a', {
        coachName: 'Ana',
        trainingSchedule: [
          { day: 'Lun', start: '17:00', end: '18:00', name: 'Técnica' },
          { day: 'Lun', start: '18:00', end: '19:00', name: 'Físico' },
        ],
      }),
    ];
    const res = await loadChildTeams(prisma(rows), [child('a')]);
    const t = res.get('p1') as { trainingSchedule: { name?: string }[] };
    expect(t.trainingSchedule.map((s) => s.name)).toEqual([
      'Técnica',
      'Físico',
    ]);
  });
});
