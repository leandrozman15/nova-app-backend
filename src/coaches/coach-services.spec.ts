jest.mock('../push/push.service', () => ({ PushService: class {} }));
import { ConflictException } from '@nestjs/common';

import { CoachClubService } from './coach-club.service';
import { CoachCoreService } from './coach-core.service';
import { CoachPortalService } from './coach-portal.service';

const coach = {
  id: 'coach1',
  userId: 'u1',
  slug: 'juan',
  displayName: 'Juan Demo',
  timezone: 'America/Argentina/Buenos_Aires',
  whatsapp: '5491100000000',
  status: 'ACTIVE',
};

function baseLesson(over: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    coachId: 'coach1',
    classTypeId: 't1',
    date: '2026-12-01',
    startMinute: 18 * 60,
    durationMinutes: 60,
    startsAt: new Date('2026-12-01T21:00:00Z'),
    endsAt: new Date('2026-12-01T22:00:00Z'),
    format: 'INDIVIDUAL',
    capacity: 1,
    price: '9000',
    clubId: 'club1',
    facilityId: 'f1',
    locationText: null,
    status: 'REQUESTED',
    openToJoin: false,
    bookingId: null,
    notes: null,
    cancelReason: null,
    classType: { name: 'Individual' },
    participants: [
      {
        id: 'p1',
        studentId: 's1',
        status: 'REQUESTED',
        attendance: null,
        charge: null,
        packId: null,
        partnerName: null,
        message: null,
        student: { name: 'Ana', level: '7ma', phone: null, userId: 'stu-user' },
      },
    ],
    ...over,
  };
}

function setup() {
  const prisma: any = {
    coachProfile: { findFirst: jest.fn().mockResolvedValue(coach) },
    coachClubLink: { findFirst: jest.fn().mockResolvedValue({ id: 'link1' }) },
    club: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'club1',
        companyId: 'co1',
        timezone: 'America/Argentina/Buenos_Aires',
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    facility: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'f1', hourlyPrice: '20000', name: 'Pádel 1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    booking: {
      create: jest.fn().mockResolvedValue({ id: 'b1' }),
      updateMany: jest.fn(),
    },
    coachLesson: { findFirst: jest.fn(), update: jest.fn() },
    coachLessonParticipant: { updateMany: jest.fn(), update: jest.fn() },
    coachPack: { findMany: jest.fn(), update: jest.fn() },
    coachStudentNote: { createMany: jest.fn() },
    user: {
      findMany: jest.fn().mockResolvedValue([{ firebaseUid: 'fb-stu' }]),
    },
  };
  prisma.$transaction = jest.fn(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
  const push = { notifyUsers: jest.fn().mockResolvedValue({ sent: 1 }) };
  const core = new CoachCoreService(prisma, push as never);
  return { prisma, push, core, portal: new CoachPortalService(core) };
}

describe('profes: cancha y cierre de clases', () => {
  it('al confirmar reserva la cancha del club como Clase y avisa al alumno', async () => {
    const { prisma, portal, push } = setup();
    prisma.coachLesson.findFirst
      .mockResolvedValueOnce(baseLesson())
      .mockResolvedValueOnce(
        baseLesson({ status: 'CONFIRMED', bookingId: 'b1' }),
      );
    await portal.confirmLesson('fb-coach', 'fb-coach', 'l1');
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'CLASE',
          source: 'COACH',
          status: 'CONFIRMED',
          price: 20000,
          contactName: 'Clase · Juan Demo',
          facilityId: 'f1',
        }),
      }),
    );
    expect(prisma.coachLesson.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { status: 'CONFIRMED', bookingId: 'b1' },
    });
    expect(push.notifyUsers).toHaveBeenCalledWith(
      ['fb-stu'],
      expect.objectContaining({ title: 'Juan Demo confirmó tu clase' }),
    );
  });

  it('si la cancha está ocupada no confirma', async () => {
    const { prisma, portal } = setup();
    prisma.coachLesson.findFirst.mockResolvedValue(baseLesson());
    prisma.booking.create.mockRejectedValue(
      new Error('violates exclusion constraint "Booking_no_overlap"'),
    );
    await expect(
      portal.confirmLesson('fb-coach', 'fb-coach', 'l1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.coachLesson.update).not.toHaveBeenCalled();
  });

  it('sin vínculo activo con el club no reserva cancha', async () => {
    const { prisma, core } = setup();
    prisma.coachClubLink.findFirst.mockResolvedValue(null);
    await expect(
      core.reserveCourt(baseLesson() as never, coach, 'fb'),
    ).resolves.toBeNull();
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('al cerrar la clase descuenta del pack o deja la clase para cobrar', async () => {
    const { prisma, portal } = setup();
    const confirmed = baseLesson({
      status: 'CONFIRMED',
      format: 'DUO',
      participants: [
        {
          id: 'p1',
          studentId: 's1',
          status: 'CONFIRMED',
          student: { name: 'Ana', level: null, phone: null, userId: null },
        },
        {
          id: 'p2',
          studentId: 's2',
          status: 'CONFIRMED',
          student: { name: 'Beto', level: null, phone: null, userId: null },
        },
        {
          id: 'p3',
          studentId: 's3',
          status: 'CONFIRMED',
          student: { name: 'Caro', level: null, phone: null, userId: null },
        },
      ],
    });
    prisma.coachLesson.findFirst.mockResolvedValue(confirmed);
    prisma.coachPack.findMany.mockImplementation(
      ({ where }: { where: { studentId: string } }) =>
        Promise.resolve(
          where.studentId === 's1'
            ? [
                {
                  id: 'pack1',
                  totalClasses: 8,
                  usedClasses: 2,
                  expiresAt: null,
                  createdAt: new Date('2026-11-01'),
                },
              ]
            : [],
        ),
    );
    await portal.completeLesson('fb-coach', 'l1', {
      attendance: [
        { participantId: 'p1', present: true },
        { participantId: 'p2', present: true },
        { participantId: 'p3', present: false },
      ],
      note: 'Trabajamos bandeja',
    });
    expect(prisma.coachPack.update).toHaveBeenCalledWith({
      where: { id: 'pack1' },
      data: { usedClasses: { increment: 1 } },
    });
    expect(prisma.coachLessonParticipant.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { attendance: 'PRESENT', charge: 'PACK', packId: 'pack1' },
    });
    expect(prisma.coachLessonParticipant.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { attendance: 'PRESENT', charge: 'UNPAID', packId: null },
    });
    expect(prisma.coachLessonParticipant.update).toHaveBeenCalledWith({
      where: { id: 'p3' },
      data: { attendance: 'ABSENT', charge: null, packId: null },
    });
    expect(prisma.coachStudentNote.createMany).toHaveBeenCalledWith({
      data: [
        { studentId: 's1', lessonId: 'l1', text: 'Trabajamos bandeja' },
        { studentId: 's2', lessonId: 'l1', text: 'Trabajamos bandeja' },
      ],
    });
    expect(prisma.coachLesson.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { status: 'DONE' },
    });
  });
});

describe('profes: portal de pádel del entrenador del club', () => {
  it('el entrenador del propio club queda vinculado sin esperar aprobación', async () => {
    const { prisma, portal } = setup();
    prisma.user.findUnique = jest
      .fn()
      .mockResolvedValue({ companyId: 'co1', role: 'coach' });
    prisma.coachClubLink.findUnique = jest.fn().mockResolvedValue(null);
    prisma.coachClubLink.create = jest
      .fn()
      .mockImplementation(({ data }) => ({ id: 'link9', ...data }));
    const result = await portal.requestClub('fb-coach', { clubId: 'club1' });
    expect(result.status).toBe('ACTIVE');
  });

  it('un profe de afuera queda pendiente de aprobación', async () => {
    const { prisma, portal } = setup();
    prisma.user.findUnique = jest
      .fn()
      .mockResolvedValue({ companyId: null, role: 'user' });
    prisma.coachClubLink.findUnique = jest.fn().mockResolvedValue(null);
    prisma.coachClubLink.create = jest
      .fn()
      .mockImplementation(({ data }) => ({ id: 'link9', ...data }));
    const result = await portal.requestClub('fb-coach', { clubId: 'club1' });
    expect(result.status).toBe('PENDING');
  });

  it('las canchas del día muestran lo ocupado sin datos del cliente', async () => {
    const { prisma, portal } = setup();
    prisma.coachClubLink.count = jest.fn().mockResolvedValue(1);
    prisma.club.findUnique.mockResolvedValue({
      id: 'club1',
      name: 'Club Demo',
      timezone: 'America/Argentina/Buenos_Aires',
      openMinute: 480,
      closeMinute: 1380,
    });
    prisma.recurringBooking = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.$executeRaw = jest.fn();
    prisma.facility.findMany.mockResolvedValue([
      { id: 'f1', name: 'Pádel 1', sport: 'padel', typeLabel: null },
    ]);
    prisma.booking.findMany = jest.fn().mockResolvedValue([
      {
        id: 'b1',
        facilityId: 'f1',
        startMinute: 1080,
        durationMinutes: 60,
        kind: 'CLASE',
      },
      {
        id: 'b2',
        facilityId: 'f1',
        startMinute: 1140,
        durationMinutes: 90,
        kind: 'ALQUILER',
      },
    ]);
    prisma.coachLesson.findMany = jest
      .fn()
      .mockResolvedValue([
        baseLesson({ status: 'CONFIRMED', bookingId: 'b1' }),
      ]);
    prisma.coachAvailability = {
      findMany: jest.fn().mockResolvedValue([
        {
          startMinute: 960,
          endMinute: 1320,
          clubId: 'club1',
          facilityId: 'f1',
        },
      ]),
    };
    const day = await portal.courts('fb-coach', 'club1', '2026-12-01');
    expect(day.busy).toEqual([
      {
        facilityId: 'f1',
        startMinute: 1140,
        endMinute: 1230,
        kind: 'ALQUILER',
      },
    ]);
    expect(day.lessons).toHaveLength(1);
    expect(JSON.stringify(day.busy)).not.toContain('contact');
  });
});

describe('profes del staff del club', () => {
  it('activar el portal de pádel crea el perfil y lo vincula al club', async () => {
    const { prisma, core } = setup();
    const service = new CoachClubService(core);
    prisma.club.findFirst = jest.fn().mockResolvedValue({
      id: 'club1',
      timezone: 'America/Argentina/Buenos_Aires',
      name: 'Club Demo',
    });
    prisma.user.findUnique = jest.fn().mockResolvedValue({
      id: 'u9',
      companyId: 'co1',
      name: 'Profe Staff Demo',
      phone: '11 0000-0009',
    });
    prisma.coachProfile.findUnique = jest
      .fn()
      .mockResolvedValueOnce(null) // no tiene perfil
      .mockResolvedValueOnce(null) // slug libre
      .mockResolvedValue(null); // ficha: sin perfil (corta el detalle)
    prisma.coachProfile.create = jest.fn().mockResolvedValue({ id: 'cp9' });
    prisma.coachClubLink.upsert = jest.fn();
    await service.enableStaff('co1', 'club1', 'fb-staff', {}, 'fb-admin');
    expect(prisma.coachProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u9',
          slug: 'profe-staff-demo',
          displayName: 'Profe Staff Demo',
          sports: ['padel'],
          whatsapp: '5491100000009',
        }),
      }),
    );
    expect(prisma.coachClubLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'ACTIVE', clubId: 'club1' }),
        update: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('un usuario de otra empresa no se puede activar', async () => {
    const { prisma, core } = setup();
    const service = new CoachClubService(core);
    prisma.club.findFirst = jest.fn().mockResolvedValue({ id: 'club1' });
    prisma.user.findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'u9', companyId: 'otra' });
    await expect(
      service.enableStaff('co1', 'club1', 'fb-x', {}, 'fb-admin'),
    ).rejects.toThrow('no tiene usuario');
  });
});

describe('reserva en cualquier cancha libre', () => {
  it('sin cancha elegida reserva la primera de pádel libre y la guarda en la clase', async () => {
    const { prisma, core } = setup();
    prisma.facility.findMany.mockResolvedValue([
      { id: 'p1', clubId: 'club1', sport: 'padel', bookable: true },
      { id: 'p2', clubId: 'club1', sport: 'padel', bookable: true },
    ]);
    prisma.recurringBooking = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.$executeRaw = jest.fn();
    prisma.booking.findMany = jest
      .fn()
      .mockResolvedValue([
        { facilityId: 'p1', startMinute: 1080, durationMinutes: 90 },
      ]);
    prisma.facility.findFirst.mockResolvedValue({
      id: 'p2',
      hourlyPrice: '20000',
      name: 'Pádel 2',
    });
    const id = await core.reserveCourt(
      baseLesson({ facilityId: null }) as never,
      coach,
      'fb',
    );
    expect(id).toBe('b1');
    expect(prisma.facility.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p2', clubId: 'club1' } }),
    );
    expect(prisma.coachLesson.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { facilityId: 'p2' },
    });
  });

  it('si están todas ocupadas avisa', async () => {
    const { prisma, core } = setup();
    prisma.facility.findMany.mockResolvedValue([
      { id: 'p1', clubId: 'club1', sport: 'padel', bookable: true },
    ]);
    prisma.recurringBooking = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.$executeRaw = jest.fn();
    prisma.booking.findMany = jest
      .fn()
      .mockResolvedValue([
        { facilityId: 'p1', startMinute: 1050, durationMinutes: 60 },
      ]);
    await expect(
      core.reserveCourt(baseLesson({ facilityId: null }) as never, coach, 'fb'),
    ).rejects.toThrow('No hay canchas libres');
  });
});
