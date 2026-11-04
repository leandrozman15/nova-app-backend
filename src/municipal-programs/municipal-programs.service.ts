import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  dniHash,
  decryptOptional,
  encryptOptional,
} from '../common/pii-crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEnrollmentDto,
  CreateProgramDto,
  SaveAttendanceDto,
  UpdateProgramDto,
} from './dto/program.dto';
import {
  attendanceRate,
  hasRoom,
  isValidDay,
  normalizeDni,
} from './program-rules';

const toDate = (v?: string) => (v ? new Date(v) : undefined);

@Injectable()
export class MunicipalProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  private async municipality(companyId: string, municipalityId: string) {
    const m = await this.prisma.municipality.findFirst({
      where: { id: municipalityId, companyId },
      select: { id: true },
    });
    if (!m) throw new NotFoundException('Municipality not found');
    return m;
  }

  private async program(companyId: string, id: string) {
    const p = await this.prisma.municipalProgram.findFirst({
      where: { id, companyId },
    });
    if (!p) throw new NotFoundException('Program not found');
    return p;
  }

  /** Programas del municipio con inscriptos y porcentaje de asistencia. */
  async list(companyId: string, municipalityId: string) {
    await this.municipality(companyId, municipalityId);
    const programs = await this.prisma.municipalProgram.findMany({
      where: { companyId, municipalityId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { enrollments: { where: { status: 'active' } } } },
      },
    });
    const ids = programs.map((p) => p.id);
    const groups = ids.length
      ? await this.prisma.programAttendance.groupBy({
          by: ['programId', 'present'],
          where: { programId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    return programs.map(({ _count, ...p }) => {
      const mine = groups.filter((g) => g.programId === p.id);
      const present = mine
        .filter((g) => g.present)
        .reduce((a, g) => a + g._count._all, 0);
      const total = mine.reduce((a, g) => a + g._count._all, 0);
      return {
        ...p,
        enrolled: _count.enrollments,
        attendanceRate: attendanceRate(present, total),
      };
    });
  }

  async create(
    companyId: string,
    municipalityId: string,
    dto: CreateProgramDto,
  ) {
    await this.municipality(companyId, municipalityId);
    return this.prisma.municipalProgram.create({
      data: {
        ...dto,
        companyId,
        municipalityId,
        startDate: toDate(dto.startDate),
        endDate: toDate(dto.endDate),
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateProgramDto) {
    await this.program(companyId, id);
    return this.prisma.municipalProgram.update({
      where: { id },
      data: {
        ...dto,
        startDate: toDate(dto.startDate),
        endDate: toDate(dto.endDate),
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.program(companyId, id);
    await this.prisma.municipalProgram.delete({ where: { id } });
    return { ok: true };
  }

  async listEnrollments(companyId: string, programId: string) {
    await this.program(companyId, programId);
    const rows = await this.prisma.programEnrollment.findMany({
      where: { programId, status: 'active' },
      orderBy: { fullName: 'asc' },
    });
    return rows.map(({ dniHash: _h, ...r }) => ({
      ...r,
      dni: decryptOptional(r.dni),
      phone: decryptOptional(r.phone),
    }));
  }

  async enroll(companyId: string, programId: string, dto: CreateEnrollmentDto) {
    const program = await this.program(companyId, programId);
    if (program.status !== 'open')
      throw new ConflictException('La inscripción está cerrada');

    const dni = normalizeDni(dto.dni);
    const active = await this.prisma.programEnrollment.count({
      where: { programId, status: 'active' },
    });
    if (!hasRoom(program.capacity, active))
      throw new ConflictException('Cupo completo');

    const hash = dniHash(dni);
    if (hash) {
      const existing = await this.prisma.programEnrollment.findFirst({
        where: { programId, dniHash: hash },
      });
      if (existing && existing.status === 'active')
        throw new ConflictException('Esa persona ya está inscripta');
      if (existing) {
        // Se había dado de baja: se reactiva con los datos nuevos.
        const back = await this.prisma.programEnrollment.update({
          where: { id: existing.id },
          data: {
            status: 'active',
            fullName: dto.fullName,
            phone: encryptOptional(dto.phone),
            email: dto.email,
            notes: dto.notes,
          },
        });
        return { id: back.id };
      }
    }
    const created = await this.prisma.programEnrollment.create({
      data: {
        programId,
        fullName: dto.fullName.trim(),
        dni: encryptOptional(dni),
        dniHash: hash,
        phone: encryptOptional(dto.phone),
        email: dto.email,
        birthDate: toDate(dto.birthDate),
        notes: dto.notes,
      },
    });
    return { id: created.id };
  }

  async cancelEnrollment(
    companyId: string,
    programId: string,
    enrollmentId: string,
  ) {
    await this.program(companyId, programId);
    const found = await this.prisma.programEnrollment.findFirst({
      where: { id: enrollmentId, programId },
    });
    if (!found) throw new NotFoundException('Enrollment not found');
    await this.prisma.programEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'cancelled' },
    });
    return { ok: true };
  }

  /** Lista de la clase de un día: cada inscripto con presente / ausente / sin marcar (null). */
  async getAttendance(companyId: string, programId: string, date: string) {
    if (!isValidDay(date))
      throw new BadRequestException('date debe ser AAAA-MM-DD');
    await this.program(companyId, programId);
    const [people, marks] = await Promise.all([
      this.prisma.programEnrollment.findMany({
        where: { programId, status: 'active' },
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true },
      }),
      this.prisma.programAttendance.findMany({
        where: { programId, date },
        select: { enrollmentId: true, present: true },
      }),
    ]);
    const byId = new Map(marks.map((m) => [m.enrollmentId, m.present]));
    return {
      date,
      people: people.map((p) => ({
        enrollmentId: p.id,
        fullName: p.fullName,
        present: byId.has(p.id) ? byId.get(p.id)! : null,
      })),
    };
  }

  async saveAttendance(
    companyId: string,
    programId: string,
    dto: SaveAttendanceDto,
  ) {
    if (!isValidDay(dto.date))
      throw new BadRequestException('date debe ser AAAA-MM-DD');
    await this.program(companyId, programId);
    const valid = await this.prisma.programEnrollment.findMany({
      where: { programId, id: { in: dto.records.map((r) => r.enrollmentId) } },
      select: { id: true },
    });
    const ok = new Set(valid.map((v) => v.id));
    const records = dto.records.filter((r) => ok.has(r.enrollmentId));
    await this.prisma.$transaction(
      records.map((r) =>
        this.prisma.programAttendance.upsert({
          where: {
            enrollmentId_date: { enrollmentId: r.enrollmentId, date: dto.date },
          },
          update: { present: r.present },
          create: {
            programId,
            enrollmentId: r.enrollmentId,
            date: dto.date,
            present: r.present,
          },
        }),
      ),
    );
    return {
      saved: records.length,
      ignored: dto.records.length - records.length,
    };
  }
}
