import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  addDays,
  isIsoDate,
  nowMinuteIn,
  todayIn,
  weekdayOf,
  zonedMinuteToUtc,
} from '../bookings/booking-time';
import { ensureOccurrences } from '../bookings/fixed-turns';
import { normalizeWhatsapp } from '../clubs/whatsapp';
import {
  CoachCoreService,
  LESSON_ACTIVE,
  type CoachRow,
} from './coach-core.service';
import {
  availabilityProblem,
  capacityFor,
  cleanSkills,
  CLUB_STAFF_ROLES,
  packToUse,
  slotStillFree,
  slugify,
  studentBalance,
  type CoachFormat,
} from './coach-rules';
import type {
  AvailabilityDto,
  BlockDto,
  ClassTypeDto,
  ClubLinkDto,
  CompleteLessonDto,
  CoachProfileDto,
  CreateLessonDto,
  NoteDto,
  PackDto,
  PaymentDto,
  StudentDto,
  UpdateCoachProfileDto,
  UpdateStudentDto,
} from './dto/coach.dto';

const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const clean = (v: string | null | undefined) =>
  v === undefined ? undefined : v?.trim() || null;
const PARTICIPANT_LIVE = ['REQUESTED', 'CONFIRMED'];

export const LESSON_SELECT = {
  id: true,
  coachId: true,
  classTypeId: true,
  date: true,
  startMinute: true,
  durationMinutes: true,
  startsAt: true,
  endsAt: true,
  format: true,
  capacity: true,
  price: true,
  clubId: true,
  facilityId: true,
  locationText: true,
  status: true,
  openToJoin: true,
  bookingId: true,
  notes: true,
  cancelReason: true,
  classType: { select: { name: true } },
  participants: {
    select: {
      id: true,
      studentId: true,
      status: true,
      attendance: true,
      charge: true,
      packId: true,
      partnerName: true,
      message: true,
      student: {
        select: { name: true, level: true, phone: true, userId: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

type LessonRow = {
  id: string;
  clubId: string | null;
  facilityId: string | null;
  price: unknown;
  classType: { name: string } | null;
  participants: {
    student: {
      name: string;
      level: string | null;
      phone: string | null;
      userId: string | null;
    };
  }[];
  [key: string]: unknown;
};

/** Portal del profe: perfil, clases, agenda, alumnos, packs y pagos. */
@Injectable()
export class CoachPortalService {
  constructor(private readonly core: CoachCoreService) {}

  private get prisma() {
    return this.core.prisma;
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────

  async me(firebaseUid: string) {
    const profile = await this.prisma.coachProfile.findFirst({
      where: { user: { firebaseUid } },
    });
    if (!profile) return { profile: null };
    const today = todayIn(profile.timezone);
    const pending = await this.prisma.coachLesson.count({
      where: {
        coachId: profile.id,
        OR: [
          { status: 'REQUESTED' },
          {
            status: 'CONFIRMED',
            participants: { some: { status: 'REQUESTED' } },
          },
        ],
        date: { gte: today },
      },
    });
    return { profile, pendingRequests: pending, today };
  }

  private async uniqueSlug(base: string, exceptId?: string) {
    const root = slugify(base);
    for (let i = 0; i < 50; i++) {
      const slug = i === 0 ? root : `${root}-${i + 1}`;
      const hit = await this.prisma.coachProfile.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!hit || hit.id === exceptId) return slug;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  private whatsappOrThrow(value: string | null | undefined) {
    if (value === undefined) return undefined;
    if (!value?.trim()) return null;
    const n = normalizeWhatsapp(value);
    if (!n)
      throw new BadRequestException(
        'El WhatsApp no parece válido. Escribilo con código de área, por ejemplo 11 3046-4848.',
      );
    return n;
  }

  async createProfile(firebaseUid: string, dto: CoachProfileDto) {
    const user = await this.core.userOf(firebaseUid);
    const existing = await this.prisma.coachProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Ya tenés un perfil de profe.');
    return this.prisma.coachProfile.create({
      data: {
        userId: user.id,
        slug: await this.uniqueSlug(dto.displayName),
        displayName: dto.displayName.trim(),
        photoUrl: clean(dto.photoUrl) ?? null,
        bio: clean(dto.bio) ?? null,
        sports: dto.sports?.length ? dto.sports : ['padel'],
        levels: dto.levels ?? [],
        zones: (dto.zones ?? []).map((z) => z.trim()).filter(Boolean),
        whatsapp: this.whatsappOrThrow(dto.whatsapp ?? user.phone) ?? null,
        instagram: clean(dto.instagram)?.replace(/^@/, '') ?? null,
        isPublic: dto.isPublic ?? true,
      },
    });
  }

  async updateProfile(firebaseUid: string, dto: UpdateCoachProfileDto) {
    const coach = await this.core.coachOf(firebaseUid);
    return this.prisma.coachProfile.update({
      where: { id: coach.id },
      data: {
        ...(dto.displayName ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.photoUrl === undefined
          ? {}
          : { photoUrl: clean(dto.photoUrl) }),
        ...(dto.bio === undefined ? {} : { bio: clean(dto.bio) }),
        ...(dto.sports ? { sports: dto.sports } : {}),
        ...(dto.levels ? { levels: dto.levels } : {}),
        ...(dto.zones
          ? { zones: dto.zones.map((z) => z.trim()).filter(Boolean) }
          : {}),
        ...(dto.whatsapp === undefined
          ? {}
          : { whatsapp: this.whatsappOrThrow(dto.whatsapp) }),
        ...(dto.instagram === undefined
          ? {}
          : { instagram: clean(dto.instagram)?.replace(/^@/, '') ?? null }),
        ...(dto.isPublic === undefined ? {} : { isPublic: dto.isPublic }),
      },
    });
  }

  // ─── Tipos de clase ───────────────────────────────────────────────────────

  async classTypes(firebaseUid: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const rows = await this.prisma.coachClassType.findMany({
      where: { coachId: coach.id },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({ ...r, price: num(r.price) }));
  }

  async saveClassType(firebaseUid: string, dto: ClassTypeDto, id?: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const data = {
      name: dto.name.trim(),
      format: dto.format,
      capacity: capacityFor(dto.format, dto.capacity),
      durationMinutes: dto.durationMinutes,
      price: dto.price,
      sport: clean(dto.sport) ?? null,
      description: clean(dto.description) ?? null,
      active: dto.active ?? true,
    };
    if (!id) {
      const row = await this.prisma.coachClassType.create({
        data: { coachId: coach.id, ...data },
      });
      return { ...row, price: num(row.price) };
    }
    const res = await this.prisma.coachClassType.updateMany({
      where: { id, coachId: coach.id },
      data,
    });
    if (!res.count) throw new NotFoundException('Clase no encontrada');
    return this.classTypes(firebaseUid);
  }

  async deleteClassType(firebaseUid: string, id: string) {
    const coach = await this.core.coachOf(firebaseUid);
    // Se desactiva: las clases ya dadas la siguen nombrando.
    const res = await this.prisma.coachClassType.updateMany({
      where: { id, coachId: coach.id },
      data: { active: false },
    });
    if (!res.count) throw new NotFoundException('Clase no encontrada');
    return { ok: true };
  }

  // ─── Clubes ───────────────────────────────────────────────────────────────

  async clubs(firebaseUid: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const links = await this.prisma.coachClubLink.findMany({
      where: {
        coachId: coach.id,
        status: { in: ['PENDING', 'ACTIVE', 'REJECTED'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        clubId: true,
        status: true,
        createdAt: true,
        club: {
          select: {
            name: true,
            logoUrl: true,
            city: true,
            openMinute: true,
            closeMinute: true,
            facilities: {
              select: { id: true, name: true, sport: true, bookable: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
    return links.map((l) => ({
      id: l.id,
      clubId: l.clubId,
      status: l.status,
      createdAt: l.createdAt,
      clubName: l.club.name,
      logoUrl: l.club.logoUrl,
      city: l.club.city,
      openMinute: l.club.openMinute ?? 480,
      closeMinute: l.club.closeMinute ?? 1380,
      // Las canchas solo se muestran con el vínculo aprobado.
      facilities: l.status === 'ACTIVE' ? l.club.facilities : [],
    }));
  }

  async requestClub(firebaseUid: string, dto: ClubLinkDto) {
    const coach = await this.core.coachOf(firebaseUid);
    const club = await this.prisma.club.findUnique({
      where: { id: dto.clubId },
      select: { id: true, companyId: true, name: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    // El entrenador (o directivo) del propio club queda vinculado sin esperar aprobación.
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { companyId: true, role: true },
    });
    const isStaff =
      Boolean(user?.companyId) &&
      user?.companyId === club.companyId &&
      CLUB_STAFF_ROLES.includes(String(user?.role ?? '').toLowerCase());
    const existing = await this.prisma.coachClubLink.findUnique({
      where: { coachId_clubId: { coachId: coach.id, clubId: club.id } },
    });
    if (existing?.status === 'ACTIVE')
      throw new ConflictException('Ya estás vinculado a este club.');
    if (existing?.status === 'PENDING')
      throw new ConflictException(
        'Ya pediste sumarte: el club tiene que aprobarlo.',
      );
    const status = isStaff ? 'ACTIVE' : 'PENDING';
    const review = isStaff
      ? { reviewedAt: new Date(), reviewedByUid: firebaseUid }
      : { reviewedAt: null, reviewedByUid: null };
    const link = existing
      ? await this.prisma.coachClubLink.update({
          where: { id: existing.id },
          data: { status, message: clean(dto.message) ?? null, ...review },
        })
      : await this.prisma.coachClubLink.create({
          data: {
            coachId: coach.id,
            clubId: club.id,
            companyId: club.companyId,
            status,
            message: clean(dto.message) ?? null,
            ...review,
          },
        });
    return { id: link.id, status: link.status, clubName: club.name };
  }

  async leaveClub(firebaseUid: string, linkId: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const res = await this.prisma.coachClubLink.updateMany({
      where: { id: linkId, coachId: coach.id },
      data: { status: 'ENDED' },
    });
    if (!res.count) throw new NotFoundException('Vínculo no encontrado');
    return { ok: true };
  }

  // ─── Disponibilidad y bloqueos ────────────────────────────────────────────

  async availability(firebaseUid: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const [items, blocks] = await Promise.all([
      this.prisma.coachAvailability.findMany({
        where: { coachId: coach.id },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.coachBlock.findMany({
        where: { coachId: coach.id, endsAt: { gte: new Date() } },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return { items, blocks };
  }

  async saveAvailability(firebaseUid: string, dto: AvailabilityDto) {
    const coach = await this.core.coachOf(firebaseUid);
    const problem = availabilityProblem(dto.items);
    if (problem) throw new BadRequestException(problem);
    const clubIds = [
      ...new Set(
        dto.items.map((i) => i.clubId).filter((x): x is string => Boolean(x)),
      ),
    ];
    const links = clubIds.length
      ? await this.prisma.coachClubLink.findMany({
          where: {
            coachId: coach.id,
            clubId: { in: clubIds },
            status: 'ACTIVE',
          },
          select: { clubId: true },
        })
      : [];
    const active = new Set(links.map((l) => l.clubId));
    for (const item of dto.items) {
      if (item.clubId && !active.has(item.clubId))
        throw new BadRequestException(
          'Solo podés usar clubes que ya aprobaron tu vínculo.',
        );
      if (item.facilityId) {
        if (!item.clubId)
          throw new BadRequestException('Elegí el club de la cancha.');
        const ok = await this.prisma.facility.count({
          where: { id: item.facilityId, clubId: item.clubId },
        });
        if (!ok) throw new BadRequestException('La cancha no es de ese club.');
      }
    }
    await this.prisma.$transaction([
      this.prisma.coachAvailability.deleteMany({
        where: { coachId: coach.id },
      }),
      this.prisma.coachAvailability.createMany({
        data: dto.items.map((i) => ({
          coachId: coach.id,
          weekday: i.weekday,
          startMinute: i.startMinute,
          endMinute: i.endMinute,
          clubId: i.clubId || null,
          facilityId: i.facilityId || null,
          locationText: clean(i.locationText) ?? null,
        })),
      }),
    ]);
    return this.availability(firebaseUid);
  }

  async addBlock(firebaseUid: string, dto: BlockDto) {
    const coach = await this.core.coachOf(firebaseUid);
    if (!isIsoDate(dto.from) || !isIsoDate(dto.to) || dto.to < dto.from)
      throw new BadRequestException('Revisá las fechas del bloqueo.');
    const startsAt = zonedMinuteToUtc(dto.from, 0, coach.timezone);
    const endsAt = zonedMinuteToUtc(dto.to, 1440, coach.timezone);
    const conflicts = await this.prisma.coachLesson.count({
      where: {
        coachId: coach.id,
        status: { in: LESSON_ACTIVE },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    const block = await this.prisma.coachBlock.create({
      data: {
        coachId: coach.id,
        startsAt,
        endsAt,
        reason: clean(dto.reason) ?? null,
      },
    });
    return { block, lessonsInside: conflicts };
  }

  async deleteBlock(firebaseUid: string, id: string) {
    const coach = await this.core.coachOf(firebaseUid);
    await this.prisma.coachBlock.deleteMany({
      where: { id, coachId: coach.id },
    });
    return { ok: true };
  }

  // ─── Agenda ───────────────────────────────────────────────────────────────

  /** Le pone nombre de club y cancha a las clases. */
  async present<T extends LessonRow>(rows: T[]) {
    const clubIds = [
      ...new Set(
        rows.map((r) => r.clubId).filter((x): x is string => Boolean(x)),
      ),
    ];
    const facilityIds = [
      ...new Set(
        rows.map((r) => r.facilityId).filter((x): x is string => Boolean(x)),
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
    return rows.map((r) => ({
      ...r,
      price: num(r.price),
      classTypeName: r.classType?.name ?? null,
      clubName: r.clubId ? (clubName.get(r.clubId) ?? null) : null,
      facilityName: r.facilityId
        ? (facilityName.get(r.facilityId) ?? null)
        : null,
    }));
  }

  async lessons(firebaseUid: string, from?: string, to?: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const today = todayIn(coach.timezone);
    const start = from && isIsoDate(from) ? from : addDays(today, -7);
    const end = to && isIsoDate(to) ? to : addDays(today, 35);
    const rows = await this.prisma.coachLesson.findMany({
      where: {
        coachId: coach.id,
        date: { gte: start, lte: end },
        status: { not: 'REJECTED' },
      },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      select: LESSON_SELECT,
    });
    // Solicitudes pendientes aunque estén fuera del rango.
    const requests = await this.prisma.coachLesson.findMany({
      where: {
        coachId: coach.id,
        date: { gte: today },
        OR: [
          { status: 'REQUESTED' },
          {
            status: 'CONFIRMED',
            participants: { some: { status: 'REQUESTED' } },
          },
        ],
      },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      select: LESSON_SELECT,
    });
    return {
      today,
      from: start,
      to: end,
      lessons: await this.present(rows),
      requests: await this.present(requests),
    };
  }

  async slots(
    firebaseUid: string,
    durationMinutes: number,
    from?: string,
    days = 14,
  ) {
    const coach = await this.core.coachOf(firebaseUid);
    const duration = Math.min(
      240,
      Math.max(30, Math.round(durationMinutes || 60)),
    );
    return this.core.slots(
      coach,
      duration,
      from && isIsoDate(from) ? from : todayIn(coach.timezone),
      Math.min(31, Math.max(1, days)),
    );
  }

  private async lessonOf(coach: CoachRow, id: string) {
    const lesson = await this.prisma.coachLesson.findFirst({
      where: { id, coachId: coach.id },
      select: LESSON_SELECT,
    });
    if (!lesson) throw new NotFoundException('Clase no encontrada');
    return lesson;
  }

  /** El profe arma una clase (con alumnos suyos o grupal abierta). Queda confirmada. */
  async createLesson(firebaseUid: string, uid: string, dto: CreateLessonDto) {
    const coach = await this.core.coachOf(firebaseUid);
    const type = dto.classTypeId
      ? await this.prisma.coachClassType.findFirst({
          where: { id: dto.classTypeId, coachId: coach.id },
        })
      : null;
    if (dto.classTypeId && !type)
      throw new NotFoundException('Tipo de clase no encontrado');
    const format = (dto.format ?? type?.format ?? 'INDIVIDUAL') as CoachFormat;
    const duration = dto.durationMinutes ?? type?.durationMinutes ?? 60;
    const capacity = capacityFor(format, dto.capacity ?? type?.capacity);
    const studentIds = [...new Set(dto.studentIds ?? [])];
    if (studentIds.length > capacity)
      throw new BadRequestException(`Esta clase tiene lugar para ${capacity}.`);
    if (studentIds.length) {
      const own = await this.prisma.coachStudent.count({
        where: { id: { in: studentIds }, coachId: coach.id },
      });
      if (own !== studentIds.length)
        throw new BadRequestException('Hay alumnos que no son tuyos.');
    }
    if (dto.startMinute + duration > 1440)
      throw new BadRequestException(
        'La clase tiene que terminar antes de la medianoche.',
      );
    if (dto.facilityId && !dto.clubId)
      throw new BadRequestException('Elegí el club de la cancha.');
    if (dto.clubId) {
      const link = await this.prisma.coachClubLink.count({
        where: { coachId: coach.id, clubId: dto.clubId, status: 'ACTIVE' },
      });
      if (!link)
        throw new BadRequestException('Ese club todavía no aprobó tu vínculo.');
    }
    const data = {
      coachId: coach.id,
      classTypeId: type?.id ?? null,
      date: dto.date,
      startMinute: dto.startMinute,
      durationMinutes: duration,
      startsAt: zonedMinuteToUtc(dto.date, dto.startMinute, coach.timezone),
      endsAt: zonedMinuteToUtc(
        dto.date,
        dto.startMinute + duration,
        coach.timezone,
      ),
      format,
      capacity,
      price: dto.price ?? (type ? Number(type.price) : 0),
      clubId: dto.clubId || null,
      facilityId: dto.facilityId || null,
      locationText: clean(dto.locationText) ?? null,
      status: 'CONFIRMED',
      openToJoin: format === 'GROUP' ? (dto.openToJoin ?? true) : false,
      notes: clean(dto.notes) ?? null,
      createdByUid: uid,
    };
    let lesson: { id: string };
    try {
      lesson = await this.prisma.coachLesson.create({
        data,
        select: { id: true },
      });
    } catch (error) {
      if (
        String((error as Error)?.message ?? '').includes(
          'CoachLesson_no_overlap',
        )
      )
        throw new ConflictException('Ya tenés otra clase en ese horario.');
      throw error;
    }
    try {
      const bookingId = await this.core.reserveCourt(
        { id: lesson.id, ...data },
        coach,
        uid,
      );
      if (bookingId)
        await this.prisma.coachLesson.update({
          where: { id: lesson.id },
          data: { bookingId },
        });
    } catch (error) {
      await this.prisma.coachLesson.delete({ where: { id: lesson.id } });
      throw error;
    }
    if (studentIds.length)
      await this.prisma.coachLessonParticipant.createMany({
        data: studentIds.map((studentId) => ({
          lessonId: lesson.id,
          studentId,
          status: 'CONFIRMED',
        })),
      });
    const full = await this.lessonOf(coach, lesson.id);
    await this.core.notify(
      full.participants.map((p) => p.student.userId),
      {
        title: `${coach.displayName} te agendó una clase`,
        body: `${dto.date.split('-').reverse().slice(0, 2).join('/')} a las ${String(Math.floor(dto.startMinute / 60)).padStart(2, '0')}:${String(dto.startMinute % 60).padStart(2, '0')}`,
        url: '/explorar/mis-clases',
        tag: `clase-${lesson.id}`,
      },
    );
    return (await this.present([full]))[0];
  }

  /** Acepta la solicitud: reserva la cancha (si corresponde) y confirma a los alumnos. */
  async confirmLesson(firebaseUid: string, uid: string, id: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const lesson = await this.lessonOf(coach, id);
    if (lesson.status !== 'REQUESTED')
      throw new ConflictException('Esta clase ya no está pendiente.');
    if (lesson.endsAt.getTime() < Date.now())
      throw new ConflictException('El horario ya pasó.');
    const bookingId = await this.core.reserveCourt(lesson, coach, uid);
    await this.prisma.$transaction([
      this.prisma.coachLesson.update({
        where: { id },
        data: { status: 'CONFIRMED', ...(bookingId ? { bookingId } : {}) },
      }),
      this.prisma.coachLessonParticipant.updateMany({
        where: { lessonId: id, status: 'REQUESTED' },
        data: { status: 'CONFIRMED' },
      }),
    ]);
    await this.core.notify(
      lesson.participants.map((p) => p.student.userId),
      {
        title: `${coach.displayName} confirmó tu clase`,
        body: `${lesson.date.split('-').reverse().slice(0, 2).join('/')} · ${String(Math.floor(lesson.startMinute / 60)).padStart(2, '0')}:${String(lesson.startMinute % 60).padStart(2, '0')} hs. ¡Nos vemos!`,
        url: '/explorar/mis-clases',
        tag: `clase-${id}`,
      },
    );
    return (await this.present([await this.lessonOf(coach, id)]))[0];
  }

  async rejectLesson(firebaseUid: string, id: string, reason?: string | null) {
    const coach = await this.core.coachOf(firebaseUid);
    const lesson = await this.lessonOf(coach, id);
    if (lesson.status !== 'REQUESTED')
      throw new ConflictException('Esta clase ya no está pendiente.');
    await this.prisma.$transaction([
      this.prisma.coachLesson.update({
        where: { id },
        data: { status: 'REJECTED', cancelReason: clean(reason) ?? null },
      }),
      this.prisma.coachLessonParticipant.updateMany({
        where: { lessonId: id },
        data: { status: 'REJECTED' },
      }),
    ]);
    await this.core.notify(
      lesson.participants.map((p) => p.student.userId),
      {
        title: `${coach.displayName} no puede en ese horario`,
        body: clean(reason) || 'Probá pedir otro horario desde su perfil.',
        url: `/explorar/profes/${coach.slug}`,
        tag: `clase-${id}`,
      },
    );
    return { ok: true };
  }

  async cancelLesson(firebaseUid: string, id: string, reason?: string | null) {
    const coach = await this.core.coachOf(firebaseUid);
    const lesson = await this.lessonOf(coach, id);
    if (!LESSON_ACTIVE.includes(lesson.status))
      throw new ConflictException('La clase no está activa.');
    await this.core.releaseCourt(
      lesson.bookingId,
      'Clase cancelada por el profe',
    );
    await this.prisma.$transaction([
      this.prisma.coachLesson.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: clean(reason) ?? null },
      }),
      this.prisma.coachLessonParticipant.updateMany({
        where: { lessonId: id, status: { in: PARTICIPANT_LIVE } },
        data: { status: 'CANCELLED' },
      }),
    ]);
    await this.core.notify(
      lesson.participants.map((p) => p.student.userId),
      {
        title: `${coach.displayName} canceló la clase`,
        body: `${lesson.date.split('-').reverse().slice(0, 2).join('/')}${clean(reason) ? ` · ${clean(reason)}` : ''}`,
        url: '/explorar/mis-clases',
        tag: `clase-${id}`,
      },
    );
    return { ok: true };
  }

  /** Alumno que pidió sumarse a una grupal: aceptar o rechazar. */
  async reviewParticipant(
    firebaseUid: string,
    lessonId: string,
    participantId: string,
    accept: boolean,
  ) {
    const coach = await this.core.coachOf(firebaseUid);
    const lesson = await this.lessonOf(coach, lessonId);
    const participant = lesson.participants.find((p) => p.id === participantId);
    if (!participant || participant.status !== 'REQUESTED')
      throw new NotFoundException('Solicitud no encontrada');
    if (accept) {
      const taken = lesson.participants.filter(
        (p) => p.status === 'CONFIRMED',
      ).length;
      if (taken >= lesson.capacity)
        throw new ConflictException('La clase ya está completa.');
    }
    await this.prisma.coachLessonParticipant.update({
      where: { id: participantId },
      data: { status: accept ? 'CONFIRMED' : 'REJECTED' },
    });
    await this.core.notify([participant.student.userId], {
      title: accept
        ? `${coach.displayName} te sumó a la clase`
        : `${coach.displayName} no pudo sumarte`,
      body: `${lesson.date.split('-').reverse().slice(0, 2).join('/')} · ${String(Math.floor(lesson.startMinute / 60)).padStart(2, '0')}:${String(lesson.startMinute % 60).padStart(2, '0')} hs`,
      url: '/explorar/mis-clases',
      tag: `clase-${lessonId}`,
    });
    return (await this.present([await this.lessonOf(coach, lessonId)]))[0];
  }

  /** Cierra la clase: presentes descuentan del pack o quedan para cobrar. */
  async completeLesson(
    firebaseUid: string,
    id: string,
    dto: CompleteLessonDto,
  ) {
    const coach = await this.core.coachOf(firebaseUid);
    const lesson = await this.lessonOf(coach, id);
    if (lesson.status !== 'CONFIRMED')
      throw new ConflictException('Solo se cierran clases confirmadas.');
    const confirmed = lesson.participants.filter(
      (p) => p.status === 'CONFIRMED',
    );
    const marks = new Map(
      dto.attendance.map((a) => [a.participantId, a.present]),
    );
    await this.prisma.$transaction(async (tx) => {
      for (const p of confirmed) {
        const present = marks.get(p.id) ?? true;
        if (!present) {
          await tx.coachLessonParticipant.update({
            where: { id: p.id },
            data: { attendance: 'ABSENT', charge: null, packId: null },
          });
          continue;
        }
        const packs = await tx.coachPack.findMany({
          where: { studentId: p.studentId },
          select: {
            id: true,
            totalClasses: true,
            usedClasses: true,
            expiresAt: true,
            createdAt: true,
          },
        });
        const pack = packToUse(packs, lesson.date);
        if (pack) {
          await tx.coachPack.update({
            where: { id: pack.id },
            data: { usedClasses: { increment: 1 } },
          });
          await tx.coachLessonParticipant.update({
            where: { id: p.id },
            data: { attendance: 'PRESENT', charge: 'PACK', packId: pack.id },
          });
        } else {
          await tx.coachLessonParticipant.update({
            where: { id: p.id },
            data: {
              attendance: 'PRESENT',
              charge: num(lesson.price) > 0 ? 'UNPAID' : 'PAID',
              packId: null,
            },
          });
        }
      }
      await tx.coachLesson.update({ where: { id }, data: { status: 'DONE' } });
      const note = clean(dto.note);
      if (note) {
        await tx.coachStudentNote.createMany({
          data: confirmed
            .filter((p) => marks.get(p.id) ?? true)
            .map((p) => ({ studentId: p.studentId, lessonId: id, text: note })),
        });
      }
    });
    return (await this.present([await this.lessonOf(coach, id)]))[0];
  }

  /**
   * Canchas del club para un día, vistas por el profe: qué está ocupado (sin datos de quién),
   * sus propias clases y sus franjas. Solo con el vínculo activo.
   */
  async courts(firebaseUid: string, clubId: string, date: string) {
    const coach = await this.core.coachOf(firebaseUid);
    if (!isIsoDate(date)) throw new BadRequestException('Fecha inválida.');
    const link = await this.prisma.coachClubLink.count({
      where: { coachId: coach.id, clubId, status: 'ACTIVE' },
    });
    if (!link)
      throw new NotFoundException('Todavía no estás vinculado a este club.');
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        timezone: true,
        openMinute: true,
        closeMinute: true,
      },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    await ensureOccurrences(this.prisma, clubId, date, date);
    const [facilities, bookings, lessons, windows] = await Promise.all([
      this.prisma.facility.findMany({
        where: { clubId, bookable: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, sport: true, typeLabel: true },
      }),
      this.prisma.booking.findMany({
        where: {
          clubId,
          date,
          status: { in: ['REQUESTED', 'PENDING_PAYMENT', 'CONFIRMED'] },
        },
        select: {
          id: true,
          facilityId: true,
          startMinute: true,
          durationMinutes: true,
          kind: true,
        },
      }),
      this.prisma.coachLesson.findMany({
        where: {
          coachId: coach.id,
          date,
          status: { in: ['REQUESTED', 'CONFIRMED', 'DONE'] },
        },
        orderBy: { startMinute: 'asc' },
        select: LESSON_SELECT,
      }),
      this.prisma.coachAvailability.findMany({
        where: { coachId: coach.id, weekday: weekdayOf(date) },
        select: {
          startMinute: true,
          endMinute: true,
          clubId: true,
          facilityId: true,
        },
      }),
    ]);
    const mine = new Set(
      lessons.map((l) => l.bookingId).filter((x): x is string => Boolean(x)),
    );
    return {
      date,
      today: todayIn(club.timezone),
      club: {
        id: club.id,
        name: club.name,
        openMinute: club.openMinute ?? 480,
        closeMinute: club.closeMinute ?? 1380,
      },
      facilities,
      // Ocupado por otros: solo el horario y el tipo, nunca el nombre del cliente.
      busy: bookings
        .filter((b) => !mine.has(b.id))
        .map((b) => ({
          facilityId: b.facilityId,
          startMinute: b.startMinute,
          endMinute: b.startMinute + b.durationMinutes,
          kind: b.kind,
        })),
      lessons: await this.present(lessons),
      windows: windows.filter((w) => !w.clubId || w.clubId === clubId),
    };
  }

  // ─── Alumnos ──────────────────────────────────────────────────────────────

  async students(firebaseUid: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const rows = await this.prisma.coachStudent.findMany({
      where: { coachId: coach.id },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        level: true,
        active: true,
        userId: true,
        createdAt: true,
        packs: {
          select: {
            totalClasses: true,
            usedClasses: true,
            price: true,
            paidAmount: true,
          },
        },
        participants: {
          select: {
            charge: true,
            attendance: true,
            lesson: { select: { price: true, date: true, status: true } },
          },
        },
      },
    });
    return rows.map((s) => {
      const unpaid = s.participants
        .filter((p) => p.charge === 'UNPAID')
        .map((p) => ({ price: p.lesson.price }));
      const done = s.participants.filter((p) => p.attendance === 'PRESENT');
      const last =
        done
          .map((p) => p.lesson.date)
          .sort()
          .pop() ?? null;
      const { participants, packs, ...rest } = s;
      void participants;
      return {
        ...rest,
        lessonsTaken: done.length,
        lastLesson: last,
        balance: studentBalance({ packs, unpaidLessons: unpaid }),
      };
    });
  }

  async createStudent(firebaseUid: string, dto: StudentDto) {
    const coach = await this.core.coachOf(firebaseUid);
    return this.prisma.coachStudent.create({
      data: {
        coachId: coach.id,
        name: dto.name.trim(),
        phone: clean(dto.phone) ?? null,
        email: clean(dto.email)?.toLowerCase() ?? null,
        level: clean(dto.level) ?? null,
        notes: clean(dto.notes) ?? null,
        birthDate: clean(dto.birthDate) ?? null,
        hand: clean(dto.hand) ?? null,
        side: clean(dto.side) ?? null,
        goals: clean(dto.goals) ?? null,
        ...(dto.skills
          ? {
              skills: cleanSkills(dto.skills) ?? Prisma.DbNull,
              skillsUpdatedAt: new Date(),
            }
          : {}),
      },
    });
  }

  private async studentOf(coach: CoachRow, id: string) {
    const s = await this.prisma.coachStudent.findFirst({
      where: { id, coachId: coach.id },
    });
    if (!s) throw new NotFoundException('Alumno no encontrado');
    return s;
  }

  async updateStudent(firebaseUid: string, id: string, dto: UpdateStudentDto) {
    const coach = await this.core.coachOf(firebaseUid);
    await this.studentOf(coach, id);
    return this.prisma.coachStudent.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.phone === undefined ? {} : { phone: clean(dto.phone) }),
        ...(dto.email === undefined
          ? {}
          : { email: clean(dto.email)?.toLowerCase() ?? null }),
        ...(dto.level === undefined ? {} : { level: clean(dto.level) }),
        ...(dto.notes === undefined ? {} : { notes: clean(dto.notes) }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
        ...(dto.birthDate === undefined
          ? {}
          : { birthDate: clean(dto.birthDate) }),
        ...(dto.hand === undefined ? {} : { hand: clean(dto.hand) }),
        ...(dto.side === undefined ? {} : { side: clean(dto.side) }),
        ...(dto.goals === undefined ? {} : { goals: clean(dto.goals) }),
        ...(dto.skills === undefined
          ? {}
          : {
              skills: cleanSkills(dto.skills) ?? Prisma.DbNull,
              skillsUpdatedAt: new Date(),
            }),
      },
    });
  }

  /** Ficha del alumno: clases, notas de progreso, packs, pagos y saldo. */
  async student(firebaseUid: string, id: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const student = await this.studentOf(coach, id);
    const [participants, notes, packs, payments] = await Promise.all([
      this.prisma.coachLessonParticipant.findMany({
        where: { studentId: id },
        select: {
          id: true,
          status: true,
          attendance: true,
          charge: true,
          packId: true,
          lesson: {
            select: {
              id: true,
              date: true,
              startMinute: true,
              durationMinutes: true,
              format: true,
              price: true,
              status: true,
              classType: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.coachStudentNote.findMany({
        where: { studentId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.coachPack.findMany({
        where: { studentId: id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coachPayment.findMany({
        where: { studentId: id },
        orderBy: { paidAt: 'desc' },
        take: 100,
      }),
    ]);
    const lessons = participants
      .map((p) => ({
        participantId: p.id,
        status: p.status,
        attendance: p.attendance,
        charge: p.charge,
        packId: p.packId,
        lessonId: p.lesson.id,
        date: p.lesson.date,
        startMinute: p.lesson.startMinute,
        durationMinutes: p.lesson.durationMinutes,
        format: p.lesson.format,
        price: num(p.lesson.price),
        lessonStatus: p.lesson.status,
        classTypeName: p.lesson.classType?.name ?? null,
      }))
      .sort(
        (a, b) => b.date.localeCompare(a.date) || b.startMinute - a.startMinute,
      );
    return {
      student,
      lessons,
      notes,
      packs: packs.map((p) => ({
        ...p,
        price: num(p.price),
        paidAmount: num(p.paidAmount),
      })),
      payments: payments.map((p) => ({ ...p, amount: num(p.amount) })),
      balance: studentBalance({
        packs,
        unpaidLessons: lessons.filter((l) => l.charge === 'UNPAID'),
      }),
    };
  }

  async addNote(firebaseUid: string, id: string, dto: NoteDto) {
    const coach = await this.core.coachOf(firebaseUid);
    await this.studentOf(coach, id);
    return this.prisma.coachStudentNote.create({
      data: {
        studentId: id,
        lessonId: dto.lessonId || null,
        text: dto.text.trim(),
      },
    });
  }

  async addPack(firebaseUid: string, id: string, dto: PackDto) {
    const coach = await this.core.coachOf(firebaseUid);
    await this.studentOf(coach, id);
    const pack = await this.prisma.coachPack.create({
      data: {
        studentId: id,
        name: dto.name.trim(),
        totalClasses: dto.totalClasses,
        price: dto.price,
        expiresAt: dto.expiresAt || null,
      },
    });
    return {
      ...pack,
      price: num(pack.price),
      paidAmount: num(pack.paidAmount),
    };
  }

  /** Pago a mano: puede ir a un pack o saldar clases sueltas. */
  async addPayment(firebaseUid: string, id: string, dto: PaymentDto) {
    const coach = await this.core.coachOf(firebaseUid);
    await this.studentOf(coach, id);
    if (dto.packId) {
      const pack = await this.prisma.coachPack.findFirst({
        where: { id: dto.packId, studentId: id },
      });
      if (!pack) throw new NotFoundException('Pack no encontrado');
    }
    const participantIds = [...new Set(dto.participantIds ?? [])];
    if (participantIds.length) {
      const owned = await this.prisma.coachLessonParticipant.count({
        where: { id: { in: participantIds }, studentId: id, charge: 'UNPAID' },
      });
      if (owned !== participantIds.length)
        throw new BadRequestException(
          'Alguna clase ya estaba paga o no es de este alumno.',
        );
    }
    await this.prisma.$transaction([
      this.prisma.coachPayment.create({
        data: {
          studentId: id,
          amount: dto.amount,
          method: dto.method,
          packId: dto.packId || null,
          note: clean(dto.note) ?? null,
        },
      }),
      ...(dto.packId
        ? [
            this.prisma.coachPack.update({
              where: { id: dto.packId },
              data: { paidAmount: { increment: dto.amount } },
            }),
          ]
        : []),
      ...(participantIds.length
        ? [
            this.prisma.coachLessonParticipant.updateMany({
              where: { id: { in: participantIds } },
              data: { charge: 'PAID' },
            }),
          ]
        : []),
    ]);
    return this.student(firebaseUid, id);
  }

  /** Resumen para el inicio del portal. */
  async summary(firebaseUid: string) {
    const coach = await this.core.coachOf(firebaseUid);
    const today = todayIn(coach.timezone);
    const monthStart = `${today.slice(0, 7)}-01`;
    const [todayLessons, pending, students, monthDone, payments] =
      await Promise.all([
        this.prisma.coachLesson.count({
          where: {
            coachId: coach.id,
            date: today,
            status: { in: ['CONFIRMED', 'DONE'] },
          },
        }),
        this.prisma.coachLesson.count({
          where: {
            coachId: coach.id,
            date: { gte: today },
            OR: [
              { status: 'REQUESTED' },
              {
                status: 'CONFIRMED',
                participants: { some: { status: 'REQUESTED' } },
              },
            ],
          },
        }),
        this.prisma.coachStudent.count({
          where: { coachId: coach.id, active: true },
        }),
        this.prisma.coachLesson.count({
          where: {
            coachId: coach.id,
            status: 'DONE',
            date: { gte: monthStart },
          },
        }),
        this.prisma.coachPayment.findMany({
          where: {
            student: { coachId: coach.id },
            paidAt: { gte: zonedMinuteToUtc(monthStart, 0, coach.timezone) },
          },
          select: { amount: true },
        }),
      ]);
    return {
      today,
      todayLessons,
      pending,
      students,
      monthDone,
      monthCollected: num(payments.reduce((s, p) => s + Number(p.amount), 0)),
    };
  }

  /** Para validar que un horario sigue libre antes de una solicitud. */
  async isSlotFree(
    coach: Pick<CoachRow, 'id' | 'timezone'>,
    date: string,
    startMinute: number,
    duration: number,
  ) {
    const windows = (await this.core.windowsOf(coach.id)).filter(
      (w) => w.weekday === weekdayOf(date),
    );
    if (!windows.length) return null;
    const [busy, courtBusy] = await Promise.all([
      this.core.busyFor(coach.id, date, coach.timezone),
      this.core.courtBusyFor(windows, date),
    ]);
    const today = todayIn(coach.timezone);
    return slotStillFree(
      {
        weekday: weekdayOf(date),
        windows,
        duration,
        busy,
        courtBusy,
        nowMinute: date === today ? nowMinuteIn(coach.timezone) : null,
      },
      startMinute,
    );
  }
}
