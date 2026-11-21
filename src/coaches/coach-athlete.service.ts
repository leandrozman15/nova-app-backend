import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { todayIn } from '../bookings/booking-time';
import { ClubAccessService } from '../club-access/club-access.service';
import { RosterService } from '../roster/roster.service';
import { CoachCoreService } from './coach-core.service';
import { studentBalance } from './coach-rules';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

/** "María José Pérez" → { firstName: "María José", lastName: "Pérez" }. */
export function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

/**
 * El alumno del profe como atleta del club: ficha en el padrón (pádel) y usuario de la app,
 * con su carnet, buffet y cuotas como cualquier atleta, y su progreso con el profe.
 */
@Injectable()
export class CoachAthleteService {
  constructor(
    private readonly core: CoachCoreService,
    private readonly roster: RosterService,
    private readonly access: ClubAccessService,
  ) {}

  private get prisma() {
    return this.core.prisma;
  }

  async createAthlete(
    firebaseUid: string,
    studentId: string,
    dto: {
      clubId: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      dni?: string | null;
      birthDate?: string | null;
    },
  ) {
    const coach = await this.core.coachOf(firebaseUid);
    const student = await this.prisma.coachStudent.findFirst({
      where: { id: studentId, coachId: coach.id },
    });
    if (!student) throw new NotFoundException('Alumno no encontrado');
    const link = await this.prisma.coachClubLink.findFirst({
      where: { coachId: coach.id, clubId: dto.clubId, status: 'ACTIVE' },
      select: { companyId: true },
    });
    if (!link)
      throw new BadRequestException('Tenés que estar en el staff de ese club.');
    const email = dto.email.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new BadRequestException('Revisá el email.');
    if (dto.birthDate && !DATE.test(dto.birthDate))
      throw new BadRequestException('Fecha de nacimiento inválida.');

    const companyId = link.companyId;
    // 1. Ficha del padrón: la que ya está vinculada, la del club con ese email, o una nueva.
    let playerId = student.playerId;
    if (playerId) {
      const ok = await this.prisma.player.count({
        where: { id: playerId, clubId: dto.clubId },
      });
      if (!ok) playerId = null;
    }
    if (!playerId) {
      const existing = await this.prisma.player.findFirst({
        where: { clubId: dto.clubId, email },
        select: { id: true },
      });
      playerId = existing?.id ?? null;
    }
    if (!playerId) {
      const name = splitName(student.name);
      const firstName = dto.firstName?.trim() || name.firstName;
      const lastName = dto.lastName?.trim() || name.lastName;
      if (!firstName || !lastName)
        throw new BadRequestException('Poné nombre y apellido del alumno.');
      const created = await this.roster.createPlayer(companyId, dto.clubId, {
        firstName,
        lastName,
        email,
        phone: student.phone ?? null,
        dni: dto.dni?.trim() || null,
        birthDate: dto.birthDate || student.birthDate || null,
        sport: 'padel',
        active: true,
        padelCategory: student.level ?? null,
        dominantSide:
          student.hand === 'zurdo' ? 'zurdo' : student.hand ? 'diestro' : null,
        position:
          student.side === 'drive'
            ? 'Drive'
            : student.side === 'reves'
              ? 'Revés'
              : student.side === 'ambos'
                ? 'Ambos lados'
                : '',
        coachStudentId: student.id,
      });
      playerId = String((created as { id: string }).id);
    }

    // 2. Acceso a la app (clave temporal, como desde el legajo).
    const result = await this.access.athlete(
      companyId,
      dto.clubId,
      playerId,
      'create',
    );

    // 3. Vínculo alumno ↔ ficha ↔ usuario.
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (user && user.id !== student.userId) {
      const clash = await this.prisma.coachStudent.findFirst({
        where: { coachId: coach.id, userId: user.id, id: { not: student.id } },
        select: { name: true },
      });
      if (clash)
        throw new ConflictException(
          `Ese usuario ya está en tus alumnos como ${clash.name}.`,
        );
    }
    await this.prisma.coachStudent.update({
      where: { id: student.id },
      data: {
        playerId,
        email,
        ...(user ? { userId: user.id } : {}),
        ...(dto.birthDate ? { birthDate: dto.birthDate } : {}),
      },
    });
    return { playerId, access: result };
  }

  /** Progreso del atleta con sus profes (lo ve en su portal). */
  async myProgress(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true },
    });
    if (!user) return { coaches: [] };
    const students = await this.prisma.coachStudent.findMany({
      where: { userId: user.id, active: true },
      select: {
        id: true,
        level: true,
        hand: true,
        side: true,
        goals: true,
        skills: true,
        skillsUpdatedAt: true,
        coach: {
          select: {
            slug: true,
            displayName: true,
            photoUrl: true,
            whatsapp: true,
            timezone: true,
          },
        },
      },
    });
    const coaches = await Promise.all(
      students.map(async (s) => {
        const today = todayIn(s.coach.timezone);
        const [notes, participants, packs] = await Promise.all([
          this.prisma.coachStudentNote.findMany({
            where: { studentId: s.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { id: true, text: true, createdAt: true },
          }),
          this.prisma.coachLessonParticipant.findMany({
            where: {
              studentId: s.id,
              status: { in: ['CONFIRMED', 'REQUESTED'] },
            },
            select: {
              status: true,
              attendance: true,
              charge: true,
              lesson: {
                select: {
                  date: true,
                  startMinute: true,
                  durationMinutes: true,
                  status: true,
                  price: true,
                  classType: { select: { name: true } },
                },
              },
            },
          }),
          this.prisma.coachPack.findMany({
            where: { studentId: s.id },
            orderBy: { createdAt: 'desc' },
            select: {
              name: true,
              totalClasses: true,
              usedClasses: true,
              price: true,
              paidAmount: true,
              expiresAt: true,
            },
          }),
        ]);
        const lessons = participants.map((p) => ({
          date: p.lesson.date,
          startMinute: p.lesson.startMinute,
          durationMinutes: p.lesson.durationMinutes,
          name: p.lesson.classType?.name ?? 'Clase',
          lessonStatus: p.lesson.status,
          status: p.status,
          attendance: p.attendance,
          charge: p.charge,
          price: num(p.lesson.price),
        }));
        const upcoming = lessons
          .filter(
            (l) =>
              l.date >= today &&
              (l.lessonStatus === 'CONFIRMED' ||
                l.lessonStatus === 'REQUESTED'),
          )
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) || a.startMinute - b.startMinute,
          );
        const done = lessons
          .filter((l) => l.lessonStatus === 'DONE')
          .sort(
            (a, b) =>
              b.date.localeCompare(a.date) || b.startMinute - a.startMinute,
          );
        return {
          coach: {
            slug: s.coach.slug,
            displayName: s.coach.displayName,
            photoUrl: s.coach.photoUrl,
            whatsapp: s.coach.whatsapp,
          },
          level: s.level,
          hand: s.hand,
          side: s.side,
          goals: s.goals,
          skills: (s.skills as Record<string, number> | null) ?? null,
          skillsUpdatedAt: s.skillsUpdatedAt,
          notes,
          upcoming: upcoming.slice(0, 10),
          history: done.slice(0, 15),
          attended: done.filter((l) => l.attendance === 'PRESENT').length,
          packs: packs.map((p) => ({
            name: p.name,
            total: p.totalClasses,
            left: Math.max(0, p.totalClasses - p.usedClasses),
            expiresAt: p.expiresAt,
          })),
          balance: studentBalance({
            packs,
            unpaidLessons: lessons.filter((l) => l.charge === 'UNPAID'),
          }).total,
        };
      }),
    );
    return { coaches };
  }
}
