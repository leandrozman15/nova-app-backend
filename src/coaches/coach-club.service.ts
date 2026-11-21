import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { todayIn } from '../bookings/booking-time';
import { CoachCoreService } from './coach-core.service';

/** Consola del club: profes que piden sumarse y profes vinculados. */
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
}
