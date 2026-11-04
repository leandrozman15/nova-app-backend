import 'reflect-metadata';

jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class FirebaseAdminService {},
}));

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { MunicipalProgramsService } from './municipal-programs.service';

describe('MunicipalProgramsService', () => {
  let prisma: any;
  let service: MunicipalProgramsService;
  const program = {
    id: 'p1',
    companyId: 'c1',
    municipalityId: 'm1',
    status: 'open',
    capacity: 2,
  };

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    prisma = {
      municipality: { findFirst: jest.fn().mockResolvedValue({ id: 'm1' }) },
      municipalProgram: {
        findFirst: jest.fn().mockResolvedValue(program),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      programEnrollment: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'e1' }),
        update: jest.fn().mockResolvedValue({ id: 'e9' }),
      },
      programAttendance: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn((x) => x),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    service = new MunicipalProgramsService(prisma);
  });

  it('no deja operar sobre un programa de otro tenant', async () => {
    prisma.municipalProgram.findFirst.mockResolvedValue(null);
    await expect(service.listEnrollments('otra', 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.municipalProgram.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', companyId: 'otra' },
    });
  });

  it('inscribe y guarda el DNI cifrado, no en claro', async () => {
    await service.enroll('c1', 'p1', {
      fullName: ' Ana Pérez ',
      dni: '30.123.456',
      phone: '1155551234',
    });
    const data = prisma.programEnrollment.create.mock.calls[0][0].data;
    expect(data.fullName).toBe('Ana Pérez');
    expect(data.dni).not.toContain('30123456');
    expect(data.phone).not.toContain('1155551234');
    expect(data.dniHash).toBeTruthy();
  });

  it('rechaza cuando el cupo está completo o la inscripción cerrada', async () => {
    prisma.programEnrollment.count.mockResolvedValue(2);
    await expect(service.enroll('c1', 'p1', { fullName: 'X' })).rejects.toThrow(
      'Cupo completo',
    );
    prisma.municipalProgram.findFirst.mockResolvedValue({
      ...program,
      status: 'closed',
    });
    await expect(
      service.enroll('c1', 'p1', { fullName: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('no inscribe dos veces a la misma persona, pero reactiva a quien se dio de baja', async () => {
    prisma.programEnrollment.findFirst.mockResolvedValue({
      id: 'e9',
      status: 'active',
    });
    await expect(
      service.enroll('c1', 'p1', { fullName: 'Ana', dni: '30123456' }),
    ).rejects.toThrow('ya está inscripta');
    prisma.programEnrollment.findFirst.mockResolvedValue({
      id: 'e9',
      status: 'cancelled',
    });
    await expect(
      service.enroll('c1', 'p1', { fullName: 'Ana', dni: '30123456' }),
    ).resolves.toEqual({ id: 'e9' });
    expect(prisma.programEnrollment.update.mock.calls[0][0].data.status).toBe(
      'active',
    );
  });

  it('asistencia: valida la fecha, ignora inscriptos ajenos y guarda el resto', async () => {
    await expect(
      service.getAttendance('c1', 'p1', '31/12/2026'),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.programEnrollment.findMany.mockResolvedValue([{ id: 'e1' }]);
    const res = await service.saveAttendance('c1', 'p1', {
      date: '2026-11-04',
      records: [
        { enrollmentId: 'e1', present: true },
        { enrollmentId: 'ajeno', present: true },
      ],
    });
    expect(res).toEqual({ saved: 1, ignored: 1 });
    expect(prisma.programAttendance.upsert).toHaveBeenCalledTimes(1);
  });

  it('la lista de la clase marca presente, ausente y sin marcar', async () => {
    prisma.programEnrollment.findMany.mockResolvedValue([
      { id: 'e1', fullName: 'Ana' },
      { id: 'e2', fullName: 'Beto' },
      { id: 'e3', fullName: 'Carla' },
    ]);
    prisma.programAttendance.findMany.mockResolvedValue([
      { enrollmentId: 'e1', present: true },
      { enrollmentId: 'e2', present: false },
    ]);
    const r = await service.getAttendance('c1', 'p1', '2026-11-04');
    expect(r.people.map((p: any) => p.present)).toEqual([true, false, null]);
  });

  it('el listado trae inscriptos y porcentaje de asistencia', async () => {
    prisma.municipalProgram.findMany.mockResolvedValue([
      { id: 'p1', name: 'Yoga', _count: { enrollments: 12 } },
    ]);
    prisma.programAttendance.groupBy.mockResolvedValue([
      { programId: 'p1', present: true, _count: { _all: 9 } },
      { programId: 'p1', present: false, _count: { _all: 3 } },
    ]);
    const [p] = await service.list('c1', 'm1');
    expect(p.enrolled).toBe(12);
    expect(p.attendanceRate).toBe(75);
  });
});
