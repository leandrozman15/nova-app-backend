import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  addDays,
  isIsoDate,
  minuteLabel,
  todayIn,
  zonedMinuteToUtc,
} from '../bookings/booking-time';
import {
  CoachCoreService,
  FORMAT_LABEL,
  LESSON_ACTIVE,
} from './coach-core.service';
import { CoachPortalService, LESSON_SELECT } from './coach-portal.service';
import { requestProblem } from './coach-rules';
import type { JoinLessonDto, LessonRequestDto } from './dto/coach.dto';

const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const clean = (v: string | null | undefined) => v?.trim() || null;
const plain = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const short = (date: string) => date.split('-').reverse().slice(0, 2).join('/');

const PUBLIC_COACH = {
  id: true,
  slug: true,
  displayName: true,
  photoUrl: true,
  bio: true,
  sports: true,
  levels: true,
  zones: true,
  whatsapp: true,
  instagram: true,
  timezone: true,
  classTypes: {
    where: { active: true },
    select: {
      id: true,
      name: true,
      format: true,
      capacity: true,
      durationMinutes: true,
      price: true,
      sport: true,
      description: true,
    },
    orderBy: { price: 'asc' as const },
  },
  clubLinks: {
    where: { status: 'ACTIVE' },
    select: {
      club: { select: { id: true, name: true, logoUrl: true, city: true } },
    },
  },
} as const;

/** Vidriera pública de profes y lo que hace el alumno desde la app. */
@Injectable()
export class CoachPublicService {
  constructor(
    private readonly core: CoachCoreService,
    private readonly portal: CoachPortalService,
  ) {}

  private get prisma() {
    return this.core.prisma;
  }

  async list(filters: {
    sport?: string;
    zone?: string;
    level?: string;
    clubId?: string;
    q?: string;
  }) {
    const rows = await this.prisma.coachProfile.findMany({
      where: {
        isPublic: true,
        status: 'ACTIVE',
        classTypes: { some: { active: true } },
        ...(filters.sport ? { sports: { has: filters.sport } } : {}),
        ...(filters.level ? { levels: { has: filters.level } } : {}),
        ...(filters.clubId
          ? {
              clubLinks: { some: { clubId: filters.clubId, status: 'ACTIVE' } },
            }
          : {}),
      },
      select: PUBLIC_COACH,
      orderBy: { displayName: 'asc' },
      take: 300,
    });
    const zone = filters.zone ? plain(filters.zone) : '';
    const q = filters.q ? plain(filters.q) : '';
    return rows
      .filter(
        (r) =>
          !zone ||
          r.zones.some((z) => plain(z).includes(zone)) ||
          r.clubLinks.some((l) => plain(l.club.city ?? '').includes(zone)),
      )
      .filter(
        (r) =>
          !q ||
          plain(
            `${r.displayName} ${r.zones.join(' ')} ${r.clubLinks.map((l) => l.club.name).join(' ')}`,
          ).includes(q),
      )
      .map((r) => ({
        slug: r.slug,
        displayName: r.displayName,
        photoUrl: r.photoUrl,
        sports: r.sports,
        levels: r.levels,
        zones: r.zones,
        bio: r.bio ? r.bio.slice(0, 160) : null,
        formats: [...new Set(r.classTypes.map((c) => c.format))],
        fromPrice: r.classTypes.length
          ? Math.min(...r.classTypes.map((c) => num(c.price)))
          : null,
        clubs: r.clubLinks.map((l) => ({
          id: l.club.id,
          name: l.club.name,
          logoUrl: l.club.logoUrl,
        })),
      }));
  }

  private async bySlug(slug: string) {
    const coach = await this.prisma.coachProfile.findFirst({
      where: { slug, isPublic: true, status: 'ACTIVE' },
      select: PUBLIC_COACH,
    });
    if (!coach) throw new NotFoundException('Profe no encontrado');
    return coach;
  }

  async detail(slug: string) {
    const coach = await this.bySlug(slug);
    const today = todayIn(coach.timezone);
    const [groups, availability] = await Promise.all([
      this.prisma.coachLesson.findMany({
        where: {
          coachId: coach.id,
          openToJoin: true,
          status: 'CONFIRMED',
          date: { gte: today, lte: addDays(today, 30) },
        },
        orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
        select: { ...LESSON_SELECT },
        take: 30,
      }),
      this.core.windowsOf(coach.id),
    ]);
    const presented = await this.portal.present(groups);
    const places = [
      ...new Set(
        availability.map((w) => w.clubId ?? w.locationText).filter(Boolean),
      ),
    ];
    return {
      slug: coach.slug,
      displayName: coach.displayName,
      photoUrl: coach.photoUrl,
      bio: coach.bio,
      sports: coach.sports,
      levels: coach.levels,
      zones: coach.zones,
      whatsapp: coach.whatsapp,
      instagram: coach.instagram,
      classTypes: coach.classTypes.map((c) => ({ ...c, price: num(c.price) })),
      clubs: coach.clubLinks.map((l) => l.club),
      places: places.length,
      // Horario semanal (sin datos de alumnos).
      weekly: availability
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
        .map((w) => ({
          weekday: w.weekday,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          clubId: w.clubId ?? null,
          locationText: w.locationText ?? null,
        })),
      groups: presented
        .map((g) => {
          const taken = g.participants.filter(
            (p) => p.status === 'CONFIRMED' || p.status === 'REQUESTED',
          ).length;
          return {
            id: g.id,
            date: g.date,
            startMinute: g.startMinute,
            durationMinutes: g.durationMinutes,
            name: g.classTypeName ?? 'Clase grupal',
            price: g.price,
            capacity: g.capacity,
            spotsLeft: Math.max(0, g.capacity - taken),
            clubName: g.clubName,
            facilityName: g.facilityName,
            locationText: g.locationText,
          };
        })
        .filter((g) => g.spotsLeft > 0),
    };
  }

  /** Horarios libres para un tipo de clase (individual o dúo). */
  async slots(slug: string, classTypeId: string, from?: string, days = 14) {
    const coach = await this.bySlug(slug);
    const type = coach.classTypes.find((c) => c.id === classTypeId);
    if (!type) throw new NotFoundException('Clase no encontrada');
    if (type.format === 'GROUP') return { classTypeId, days: [] };
    const start = from && isIsoDate(from) ? from : todayIn(coach.timezone);
    const result = await this.core.slots(
      coach,
      type.durationMinutes,
      start,
      Math.min(21, Math.max(1, days)),
    );
    const clubIds = [
      ...new Set(
        result
          .flatMap((d) => d.slots.map((s) => s.clubId))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const facilityIds = [
      ...new Set(
        result
          .flatMap((d) => d.slots.map((s) => s.facilityId))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const [clubs, facilities] = await Promise.all([
      clubIds.length
        ? this.prisma.club.findMany({
            where: { id: { in: clubIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
      facilityIds.length
        ? this.prisma.facility.findMany({
            where: { id: { in: facilityIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);
    const clubName = new Map(clubs.map((c) => [c.id, c.name]));
    const facilityName = new Map(facilities.map((f) => [f.id, f.name]));
    return {
      classTypeId,
      durationMinutes: type.durationMinutes,
      days: result.map((d) => ({
        date: d.date,
        slots: d.slots.map((s) => ({
          startMinute: s.startMinute,
          place: s.clubId
            ? [
                clubName.get(s.clubId),
                s.facilityId ? facilityName.get(s.facilityId) : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : s.locationText,
        })),
      })),
    };
  }

  /** Alumno del profe que corresponde a este usuario (lo crea si no existe). */
  private async studentFor(
    coachId: string,
    user: {
      id: string;
      name: string | null;
      email: string;
      phone: string | null;
    },
    extra: { phone?: string | null; level?: string | null },
  ) {
    const existing = await this.prisma.coachStudent.findUnique({
      where: { coachId_userId: { coachId, userId: user.id } },
    });
    if (existing) {
      if (
        (!existing.phone && clean(extra.phone)) ||
        (!existing.level && clean(extra.level))
      )
        return this.prisma.coachStudent.update({
          where: { id: existing.id },
          data: {
            phone: existing.phone ?? clean(extra.phone),
            level: existing.level ?? clean(extra.level),
            active: true,
          },
        });
      return existing;
    }
    return this.prisma.coachStudent.create({
      data: {
        coachId,
        userId: user.id,
        name: user.name?.trim() || user.email.split('@')[0],
        email: user.email,
        phone: clean(extra.phone) ?? user.phone,
        level: clean(extra.level),
      },
    });
  }

  /** Pedido de clase individual o dúo en un horario libre. El profe la acepta o la rechaza. */
  async request(firebaseUid: string, dto: LessonRequestDto) {
    const user = await this.core.userOf(firebaseUid);
    const coach = await this.bySlug(dto.coach);
    if (
      coach.id &&
      (await this.prisma.coachProfile.count({
        where: { id: coach.id, userId: user.id },
      }))
    )
      throw new BadRequestException('No podés pedirte una clase a vos mismo.');
    const type = coach.classTypes.find((c) => c.id === dto.classTypeId);
    if (!type) throw new NotFoundException('Clase no encontrada');
    if (type.format === 'GROUP')
      throw new BadRequestException(
        'Para las grupales, sumate a una de las clases publicadas.',
      );
    const today = todayIn(coach.timezone);
    const problem = requestProblem({
      date: dto.date,
      today,
      startMinute: dto.startMinute,
      duration: type.durationMinutes,
    });
    if (problem) throw new BadRequestException(problem);
    const slot = await this.portal.isSlotFree(
      coach,
      dto.date,
      dto.startMinute,
      type.durationMinutes,
    );
    if (!slot)
      throw new ConflictException('Ese horario ya no está libre. Elegí otro.');
    const pendingCount = await this.prisma.coachLessonParticipant.count({
      where: {
        status: 'REQUESTED',
        student: { userId: user.id, coachId: coach.id },
        lesson: { date: { gte: today } },
      },
    });
    if (pendingCount >= 3)
      throw new ConflictException(
        'Ya tenés 3 pedidos esperando respuesta de este profe.',
      );
    const student = await this.studentFor(coach.id, user, dto);
    let lessonId: string;
    try {
      const lesson = await this.prisma.coachLesson.create({
        data: {
          coachId: coach.id,
          classTypeId: type.id,
          date: dto.date,
          startMinute: dto.startMinute,
          durationMinutes: type.durationMinutes,
          startsAt: zonedMinuteToUtc(dto.date, dto.startMinute, coach.timezone),
          endsAt: zonedMinuteToUtc(
            dto.date,
            dto.startMinute + type.durationMinutes,
            coach.timezone,
          ),
          format: type.format,
          capacity: type.capacity,
          price: type.price,
          clubId: slot.clubId,
          facilityId: slot.facilityId,
          locationText: slot.locationText,
          status: 'REQUESTED',
          createdByUid: firebaseUid,
          participants: {
            create: {
              studentId: student.id,
              status: 'REQUESTED',
              partnerName: clean(dto.partnerName),
              message: clean(dto.message),
            },
          },
        },
        select: { id: true },
      });
      lessonId = lesson.id;
    } catch (error) {
      if (
        String((error as Error)?.message ?? '').includes(
          'CoachLesson_no_overlap',
        )
      )
        throw new ConflictException(
          'Alguien pidió ese horario recién. Elegí otro.',
        );
      throw error;
    }
    const profile = await this.prisma.coachProfile.findUnique({
      where: { id: coach.id },
      select: { userId: true },
    });
    await this.core.notify([profile?.userId], {
      title: `Nuevo pedido de clase: ${student.name}`,
      body: `${type.name} · ${short(dto.date)} a las ${minuteLabel(dto.startMinute)}. Tocá para aceptar o rechazar.`,
      url: '/explorar/profe',
      tag: `pedido-${lessonId}`,
    });
    return { id: lessonId, status: 'REQUESTED' };
  }

  /** Pedido para sumarse a una clase grupal publicada. */
  async join(firebaseUid: string, lessonId: string, dto: JoinLessonDto) {
    const user = await this.core.userOf(firebaseUid);
    const lesson = await this.prisma.coachLesson.findFirst({
      where: { id: lessonId, openToJoin: true, status: 'CONFIRMED' },
      select: {
        id: true,
        coachId: true,
        date: true,
        startMinute: true,
        capacity: true,
        startsAt: true,
        coach: { select: { userId: true, displayName: true } },
        participants: { select: { status: true } },
      },
    });
    if (!lesson || lesson.startsAt.getTime() < Date.now())
      throw new NotFoundException('Esa clase ya no está disponible.');
    if (lesson.coach.userId === user.id)
      throw new BadRequestException('Es tu propia clase.');
    const taken = lesson.participants.filter(
      (p) => p.status === 'CONFIRMED' || p.status === 'REQUESTED',
    ).length;
    if (taken >= lesson.capacity)
      throw new ConflictException('La clase ya está completa.');
    const student = await this.studentFor(lesson.coachId, user, dto);
    const existing = await this.prisma.coachLessonParticipant.findUnique({
      where: { lessonId_studentId: { lessonId, studentId: student.id } },
    });
    if (existing && ['REQUESTED', 'CONFIRMED'].includes(existing.status))
      throw new ConflictException('Ya pediste sumarte a esta clase.');
    if (existing)
      await this.prisma.coachLessonParticipant.update({
        where: { id: existing.id },
        data: { status: 'REQUESTED', message: clean(dto.message) },
      });
    else
      await this.prisma.coachLessonParticipant.create({
        data: {
          lessonId,
          studentId: student.id,
          status: 'REQUESTED',
          message: clean(dto.message),
        },
      });
    await this.core.notify([lesson.coach.userId], {
      title: `${student.name} quiere sumarse a tu grupal`,
      body: `${short(lesson.date)} a las ${minuteLabel(lesson.startMinute)}. Tocá para aceptar.`,
      url: '/explorar/profe',
      tag: `pedido-${lessonId}`,
    });
    return { ok: true, status: 'REQUESTED' };
  }

  /** Clases del alumno (todas sus cuentas de alumno con cualquier profe). */
  async myLessons(firebaseUid: string) {
    const user = await this.core.userOf(firebaseUid);
    const rows = await this.prisma.coachLessonParticipant.findMany({
      where: { student: { userId: user.id } },
      orderBy: { lesson: { startsAt: 'desc' } },
      take: 100,
      select: {
        id: true,
        status: true,
        attendance: true,
        charge: true,
        lesson: {
          select: {
            id: true,
            date: true,
            startMinute: true,
            durationMinutes: true,
            format: true,
            price: true,
            status: true,
            clubId: true,
            facilityId: true,
            locationText: true,
            cancelReason: true,
            classType: { select: { name: true } },
            coach: {
              select: {
                slug: true,
                displayName: true,
                photoUrl: true,
                whatsapp: true,
              },
            },
          },
        },
      },
    });
    const lessons = await this.portal.present(
      rows.map((r) => ({
        ...r.lesson,
        classType: r.lesson.classType,
        participants: [] as never[],
      })),
    );
    const byId = new Map(lessons.map((l) => [l.id, l]));
    const packs = await this.prisma.coachPack.findMany({
      where: { student: { userId: user.id } },
      select: {
        name: true,
        totalClasses: true,
        usedClasses: true,
        expiresAt: true,
        student: {
          select: { coach: { select: { displayName: true, slug: true } } },
        },
      },
    });
    return {
      lessons: rows.map((r) => {
        const l = byId.get(r.lesson.id)!;
        return {
          participantId: r.id,
          status: r.status,
          attendance: r.attendance,
          charge: r.charge,
          lessonId: l.id,
          lessonStatus: r.lesson.status,
          date: l.date,
          startMinute: l.startMinute,
          durationMinutes: l.durationMinutes,
          format: l.format,
          formatLabel: FORMAT_LABEL[l.format] ?? l.format,
          price: l.price,
          name: l.classTypeName,
          clubName: l.clubName,
          facilityName: l.facilityName,
          locationText: l.locationText,
          cancelReason: r.lesson.cancelReason,
          coach: r.lesson.coach,
        };
      }),
      packs: packs
        .filter((p) => p.usedClasses < p.totalClasses)
        .map((p) => ({
          name: p.name,
          left: p.totalClasses - p.usedClasses,
          total: p.totalClasses,
          expiresAt: p.expiresAt,
          coach: p.student.coach,
        })),
    };
  }

  /** El alumno cancela su lugar (si es individual o dúo, se cancela la clase y se libera la cancha). */
  async cancelMine(firebaseUid: string, participantId: string) {
    const user = await this.core.userOf(firebaseUid);
    const p = await this.prisma.coachLessonParticipant.findFirst({
      where: { id: participantId, student: { userId: user.id } },
      select: {
        id: true,
        status: true,
        student: { select: { name: true } },
        lesson: {
          select: {
            id: true,
            status: true,
            format: true,
            bookingId: true,
            startsAt: true,
            date: true,
            startMinute: true,
            coach: { select: { userId: true } },
          },
        },
      },
    });
    if (
      !p ||
      !['REQUESTED', 'CONFIRMED'].includes(p.status) ||
      !LESSON_ACTIVE.includes(p.lesson.status)
    )
      throw new NotFoundException('No hay nada para cancelar.');
    if (p.lesson.startsAt.getTime() < Date.now())
      throw new ConflictException('La clase ya empezó.');
    const others = await this.prisma.coachLessonParticipant.count({
      where: {
        lessonId: p.lesson.id,
        id: { not: p.id },
        status: { in: ['REQUESTED', 'CONFIRMED'] },
      },
    });
    const wholeLesson = p.lesson.format !== 'GROUP' && others === 0;
    await this.prisma.coachLessonParticipant.update({
      where: { id: p.id },
      data: { status: 'CANCELLED' },
    });
    if (wholeLesson) {
      await this.core.releaseCourt(
        p.lesson.bookingId,
        'Clase cancelada por el alumno',
      );
      await this.prisma.coachLesson.update({
        where: { id: p.lesson.id },
        data: { status: 'CANCELLED', cancelReason: 'Cancelada por el alumno' },
      });
    }
    await this.core.notify([p.lesson.coach.userId], {
      title: `${p.student.name} canceló`,
      body: `Clase del ${short(p.lesson.date)} a las ${minuteLabel(p.lesson.startMinute)}${wholeLesson ? ': el horario quedó libre.' : '.'}`,
      url: '/explorar/profe',
      tag: `clase-${p.lesson.id}`,
    });
    return { ok: true };
  }
}
