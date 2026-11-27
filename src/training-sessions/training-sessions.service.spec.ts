import { TrainingSessionsService } from './training-sessions.service';

const mk = (existing: Record<string, any> = {}) => {
  const prisma: any = {
    trainingSession: {
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ ...(existing[where.id] ?? {}), ...data })),
      findFirst: jest.fn(async ({ where }: any) => existing[where.id] ?? null),
    },
  };
  return { svc: new TrainingSessionsService(prisma), prisma };
};

describe('entrenador de la sesión de entrenamiento', () => {
  it('guarda el coachName al crear una sesión', async () => {
    const { svc } = mk();
    const created = await svc.create('c1', {
      clubId: 'club1',
      teamId: 'team1',
      title: 'Entrenamiento Físico',
      scheduledAt: new Date('2026-12-01T18:00:00Z'),
      location: 'Cancha Principal N°1',
      coachName: 'Juan Pérez',
    } as any);
    expect(created.coachName).toBe('Juan Pérez');
    expect(created.location).toBe('Cancha Principal N°1');
  });

  it('actualiza el coachName de una sesión existente', async () => {
    const { svc } = mk({ s1: { id: 's1', companyId: 'c1' } });
    const updated = await svc.update('c1', 's1', { coachName: 'María Gómez' } as any);
    expect(updated.coachName).toBe('María Gómez');
  });
});
