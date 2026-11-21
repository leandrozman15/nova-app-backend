jest.mock('../push/push.service', () => ({ PushService: class {} }));
jest.mock('../roster/roster.service', () => ({ RosterService: class {} }));
jest.mock('../club-access/club-access.service', () => ({
  ClubAccessService: class {},
}));
import { CoachAthleteService, splitName } from './coach-athlete.service';

function setup() {
  const prisma: any = {
    coachProfile: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'coach1', status: 'ACTIVE' }),
    },
    coachStudent: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    coachClubLink: {
      findFirst: jest.fn().mockResolvedValue({ companyId: 'co1' }),
    },
    player: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: { findUnique: jest.fn() },
  };
  const core: any = {
    prisma,
    coachOf: jest.fn().mockResolvedValue({ id: 'coach1' }),
  };
  const roster: any = {
    createPlayer: jest.fn().mockResolvedValue({ id: 'pl1' }),
  };
  const access: any = {
    athlete: jest.fn().mockResolvedValue({
      email: 'ana@example.com',
      password: 'Temp-123',
      status: 'created',
      message: 'Acceso del atleta creado.',
    }),
  };
  return {
    prisma,
    roster,
    access,
    service: new CoachAthleteService(core, roster, access),
  };
}

describe('alumna de pádel con usuario', () => {
  it('separa nombre y apellido', () => {
    expect(splitName('María José Pérez')).toEqual({
      firstName: 'María José',
      lastName: 'Pérez',
    });
    expect(splitName('Ana')).toEqual({ firstName: 'Ana', lastName: '' });
  });

  it('crea la ficha de pádel en el padrón, el acceso y la vincula', async () => {
    const { prisma, roster, access, service } = setup();
    prisma.coachStudent.findFirst.mockResolvedValueOnce({
      id: 's1',
      name: 'Ana Demo',
      phone: '11 0000-0001',
      level: '6ta',
      hand: 'zurdo',
      side: 'reves',
      birthDate: null,
      playerId: null,
      userId: null,
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'u-ana' });
    prisma.coachStudent.findFirst.mockResolvedValueOnce(null); // sin choque
    const result = await service.createAthlete('fb-coach', 's1', {
      clubId: 'club1',
      email: ' Ana@Example.com ',
    });
    expect(roster.createPlayer).toHaveBeenCalledWith(
      'co1',
      'club1',
      expect.objectContaining({
        firstName: 'Ana',
        lastName: 'Demo',
        email: 'ana@example.com',
        sport: 'padel',
        padelCategory: '6ta',
        dominantSide: 'zurdo',
        position: 'Revés',
      }),
    );
    expect(access.athlete).toHaveBeenCalledWith(
      'co1',
      'club1',
      'pl1',
      'create',
    );
    expect(prisma.coachStudent.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: expect.objectContaining({
        playerId: 'pl1',
        userId: 'u-ana',
        email: 'ana@example.com',
      }),
    });
    expect(result.access.password).toBe('Temp-123');
  });

  it('si ya está en el padrón con ese email, usa esa ficha', async () => {
    const { prisma, roster, service } = setup();
    prisma.coachStudent.findFirst.mockResolvedValueOnce({
      id: 's1',
      name: 'Ana Demo',
      playerId: null,
      userId: null,
    });
    prisma.player.findFirst.mockResolvedValue({ id: 'pl-existente' });
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.createAthlete('fb-coach', 's1', {
      clubId: 'club1',
      email: 'ana@example.com',
    });
    expect(roster.createPlayer).not.toHaveBeenCalled();
    expect(result.playerId).toBe('pl-existente');
  });

  it('solo en un club donde el profe está en el staff', async () => {
    const { prisma, service } = setup();
    prisma.coachStudent.findFirst.mockResolvedValueOnce({
      id: 's1',
      name: 'Ana Demo',
    });
    prisma.coachClubLink.findFirst.mockResolvedValue(null);
    await expect(
      service.createAthlete('fb-coach', 's1', {
        clubId: 'otro',
        email: 'a@example.com',
      }),
    ).rejects.toThrow('staff');
  });
});
