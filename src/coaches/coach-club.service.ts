import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { todayIn } from '../bookings/booking-time';
import { normalizeWhatsapp } from '../clubs/whatsapp';
import { studentPhotos } from '../common/profile-photos';
import { CoachCoreService } from './coach-core.service';
import { slugify, studentBalance } from './coach-rules';

/**
 * Consola del club: los profes de pádel son parte del staff. Desde la ficha del entrenador
 * el club activa su portal, ve sus clases, alumnos y niveles, y decide si aparece en la vidriera.
 */
@Injectable()
export class CoachClubService {
  constructor(private readonly core: CoachCoreService) {}

  private get prisma() {
    return this.core.prisma;
  }

  async list(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true, timezone: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    const today = todayIn(club.timezone);
    const links = await this.prisma.coachClubLink.findMany({
      where: { clubId, status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: [{ status: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        reviewedAt: true,
        coach: {
          select: {
            id: true,
            slug: true,
            displayName: true,
            photoUrl: true,
            sports: true,
            levels: true,
            whatsapp: true,
            user: { select: { email: true } },
            classTypes: {
              where: { active: true },
              select: { name: true, format: true, price: true },
            },
          },
        },
      },
    });
    const coachIds = links.map((l) => l.coach.id);
    const upcoming = coachIds.length
      ? await this.prisma.coachLesson.groupBy({
          by: ['coachId'],
          where: {
            coachId: { in: coachIds },
            clubId,
            status: 'CONFIRMED',
            date: { gte: today },
          },
          _count: { _all: true },
        })
      : [];
    const count = new Map(upcoming.map((u) => [u.coachId, u._count._all]));
    return links.map((l) => ({
      id: l.id,
      status: l.status,
      message: l.message,
      createdAt: l.createdAt,
      reviewedAt: l.reviewedAt,
      upcomingLessons: count.get(l.coach.id) ?? 0,
      coach: {
        slug: l.coach.slug,
        displayName: l.coach.displayName,
        photoUrl: l.coach.photoUrl,
        sports: l.coach.sports,
        levels: l.coach.levels,
        whatsapp: l.coach.whatsapp,
        email: l.coach.user.email,
        classTypes: l.coach.classTypes.map((c) => ({
          ...c,
          price: Number(c.price),
        })),
      },
    }));
  }

  async review(
    companyId: string,
    clubId: string,
    linkId: string,
    action: 'approve' | 'reject' | 'end',
    uid: string,
  ) {
    const link = await this.prisma.coachClubLink.findFirst({
      where: { id: linkId, clubId, companyId },
      select: {
        id: true,
        status: true,
        coach: { select: { userId: true } },
        club: { select: { name: true } },
      },
    });
    if (!link) throw new NotFoundException('Profe no encontrado');
    if (action !== 'end' && link.status !== 'PENDING')
      throw new ConflictException('Esta solicitud ya fue respondida.');
    const status =
      action === 'approve'
        ? 'ACTIVE'
        : action === 'reject'
          ? 'REJECTED'
          : 'ENDED';
    await this.prisma.coachClubLink.update({
      where: { id: link.id },
      data: { status, reviewedAt: new Date(), reviewedByUid: uid },
    });
    if (action !== 'end')
      await this.core.notify([link.coach.userId], {
        title:
          action === 'approve'
            ? `${link.club.name} aprobó tu vínculo`
            : `${link.club.name} no aprobó tu vínculo`,
        body:
          action === 'approve'
            ? 'Ya podés cargar tus horarios en sus canchas.'
            : 'Podés escribirle al club para hablarlo.',
        url: '/explorar/profe',
        tag: `vinculo-${link.id}`,
      });
    return { ok: true, status };
  }

  // ─── Profes del staff ──────────────────────────────────────────────

  /** Usuario del entrenador del staff (debe ser de la misma empresa). */
  private async staffUser(companyId: string, staffUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: staffUid },
      select: { id: true, companyId: true, name: true, phone: true },
    });
    if (!user || user.companyId !== companyId)
      throw new NotFoundException(
        'Este entrenador todavía no tiene usuario en el sistema.',
      );
    return user;
  }

  private async clubOf(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true, timezone: true, name: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    return club;
  }

  private async slugFor(name: string) {
    const root = slugify(name);
    for (let i = 0; i < 50; i++) {
      const slug = i === 0 ? root : `${root}-${i + 1}`;
      const hit = await this.prisma.coachProfile.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!hit) return slug;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  /**
   * Activa el portal de pádel de un entrenador del staff: crea su perfil de profe (si no tiene)
   * y lo deja vinculado al club. Se puede llamar varias veces.
   */
  async enableStaff(
    companyId: string,
    clubId: string,
    staffUid: string,
    dto: { displayName?: string | null; isPublic?: boolean },
    byUid: string,
  ) {
    await this.clubOf(companyId, clubId);
    const user = await this.staffUser(companyId, staffUid);
    let profile = await this.prisma.coachProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) {
      const displayName =
        dto.displayName?.trim() || user.name?.trim() || 'Profe de pádel';
      profile = await this.prisma.coachProfile.create({
        data: {
          userId: user.id,
          slug: await this.slugFor(displayName),
          displayName,
          sports: ['padel'],
          whatsapp: user.phone ? normalizeWhatsapp(user.phone) : null,
          isPublic: dto.isPublic ?? true,
        },
        select: { id: true },
      });
    } else if (dto.isPublic !== undefined) {
      await this.prisma.coachProfile.update({
        where: { id: profile.id },
        data: { isPublic: dto.isPublic },
      });
    }
    await this.prisma.coachClubLink.upsert({
      where: { coachId_clubId: { coachId: profile.id, clubId } },
      create: {
        coachId: profile.id,
        clubId,
        companyId,
        status: 'ACTIVE',
        reviewedAt: new Date(),
        reviewedByUid: byUid,
      },
      update: {
        status: 'ACTIVE',
        reviewedAt: new Date(),
        reviewedByUid: byUid,
      },
    });
    return this.staffDetail(companyId, clubId, staffUid);
  }

  /** Mostrar u ocultar al profe (y sus clases) en la vidriera del club y de la app. */
  async setStaffPublic(
    companyId: string,
    clubId: string,
    staffUid: string,
    isPublic: boolean,
  ) {
    await this.clubOf(companyId, clubId);
    const user = await this.staffUser(companyId, staffUid);
    const updated = await this.prisma.coachProfile.updateMany({
      where: { userId: user.id },
      data: { isPublic },
    });
    if (!updated.count)
      throw new NotFoundException('Este entrenador no tiene portal de pádel.');
    return this.staffDetail(companyId, clubId, staffUid);
  }

  /**
   * Ficha de pádel del entrenador para el club: sus clases en el club, sus alumnos
   * (con nivel y progreso) y la actividad del mes.
   */
  async staffDetail(companyId: string, clubId: string, staffUid: string) {
    const club = await this.clubOf(companyId, clubId);
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: staffUid },
      select: { id: true, companyId: true },
    });
    if (!user || user.companyId !== companyId)
      return { enabled: false as const, hasUser: false };
    const coach = await this.prisma.coachProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        slug: true,
        displayName: true,
        isPublic: true,
        status: true,
        levels: true,
        clubLinks: { where: { clubId }, select: { status: true } },
        classTypes: {
          where: { active: true },
          orderBy: { price: 'asc' },
          select: {
            name: true,
            format: true,
            durationMinutes: true,
            price: true,
          },
        },
        availability: {
          where: { OR: [{ clubId }, { clubId: null }] },
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
          select: {
            weekday: true,
            startMinute: true,
            endMinute: true,
            facilityId: true,
          },
        },
      },
    });
    if (!coach) return { enabled: false as const, hasUser: true };

    const today = todayIn(club.timezone);
    const monthStart = `${today.slice(0, 7)}-01`;
    const lessonSelect = {
      id: true,
      date: true,
      startMinute: true,
      durationMinutes: true,
      format: true,
      capacity: true,
      status: true,
      facilityId: true,
      classType: { select: { name: true } },
      participants: {
        where: { status: 'CONFIRMED' },
        select: {
          attendance: true,
          student: { select: { name: true, level: true } },
        },
      },
    } as const;
    const [upcoming, recent, monthDone, students] = await Promise.all([
      this.prisma.coachLesson.findMany({
        where: {
          coachId: coach.id,
          clubId,
          status: { in: ['CONFIRMED', 'REQUESTED'] },
          date: { gte: today },
        },
        orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
        take: 20,
        select: lessonSelect,
      }),
      this.prisma.coachLesson.findMany({
        where: { coachId: coach.id, clubId, status: 'DONE' },
        orderBy: [{ date: 'desc' }, { startMinute: 'desc' }],
        take: 10,
        select: lessonSelect,
      }),
      this.prisma.coachLesson.count({
        where: {
          coachId: coach.id,
          clubId,
          status: 'DONE',
          date: { gte: monthStart },
        },
      }),
      this.prisma.coachStudent.findMany({
        where: { coachId: coach.id },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          level: true,
          active: true,
          skills: true,
          userId: true,
          playerId: true,
          participants: {
            where: { attendance: 'PRESENT' },
            select: { lesson: { select: { date: true } } },
          },
          packs: {
            select: {
              totalClasses: true,
              usedClasses: true,
              price: true,
              paidAmount: true,
            },
          },
        },
      }),
    ]);

    const facilityIds = [
      ...new Set(
        [...upcoming, ...recent, ...coach.availability]
          .map((x) => x.facilityId)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const facilityName = new Map(
      (facilityIds.length
        ? await this.prisma.facility.findMany({
            where: { id: { in: facilityIds } },
            select: { id: true, name: true },
          })
        : []
      ).map((f) => [f.id, f.name]),
    );
    const lesson = (l: (typeof upcoming)[number]) => ({
      id: l.id,
      date: l.date,
      startMinute: l.startMinute,
      durationMinutes: l.durationMinutes,
      format: l.format,
      capacity: l.capacity,
      status: l.status,
      className: l.classType?.name ?? null,
      facilityName: l.facilityId
        ? (facilityName.get(l.facilityId) ?? null)
        : null,
      students: l.participants.map((p) => p.student.name),
      present: l.participants.filter((p) => p.attendance === 'PRESENT').length,
    });

    const photos = await studentPhotos(this.prisma, students);
    const roster = students.map((s) => {
      const values = Object.values(
        (s.skills as Record<string, number>) ?? {},
      ).filter((v) => typeof v === 'number');
      const dates = s.participants.map((p) => p.lesson.date).sort();
      return {
        id: s.id,
        name: s.name,
        photoUrl: photos.get(s.id) ?? null,
        level: s.level,
        active: s.active,
        lessonsTaken: dates.length,
        lastLesson: dates.at(-1) ?? null,
        skillAverage: values.length
          ? Math.round(
              (values.reduce((a, b) => a + b, 0) / values.length) * 10,
            ) / 10
          : null,
        classesLeft: studentBalance({ packs: s.packs, unpaidLessons: [] })
          .classesLeft,
      };
    });
    const levels = new Map<string, number>();
    for (const s of roster.filter((r) => r.active))
      levels.set(s.level ?? '', (levels.get(s.level ?? '') ?? 0) + 1);

    return {
      enabled: true as const,
      hasUser: true,
      coach: {
        slug: coach.slug,
        displayName: coach.displayName,
        isPublic: coach.isPublic,
        status: coach.status,
        linked: coach.clubLinks[0]?.status === 'ACTIVE',
      },
      classTypes: coach.classTypes.map((c) => ({
        ...c,
        price: Number(c.price),
      })),
      weekly: coach.availability.map((a) => ({
        weekday: a.weekday,
        startMinute: a.startMinute,
        endMinute: a.endMinute,
        facilityName: a.facilityId
          ? (facilityName.get(a.facilityId) ?? null)
          : null,
      })),
      stats: {
        activeStudents: roster.filter((r) => r.active).length,
        upcoming: upcoming.filter((l) => l.status === 'CONFIRMED').length,
        requests: upcoming.filter((l) => l.status === 'REQUESTED').length,
        monthDone,
      },
      levels: [...levels.entries()].map(([level, count]) => ({
        level: level || null,
        count,
      })),
      upcoming: upcoming.map(lesson),
      recent: recent.map(lesson),
      students: roster,
    };
  }
}
