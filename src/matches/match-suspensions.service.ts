import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';

import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { COMPANY_WIDE_ROLES } from '../common/http/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { RescheduleMatchDto, SuspendMatchDto } from './dto/suspend-match.dto';

const include = {
  suspensions: { orderBy: { suspendedAt: 'desc' as const } },
  homeTeam: { select: { id: true, name: true, clubId: true } },
  awayTeam: { select: { id: true, name: true, clubId: true } },
};

@Injectable()
export class MatchSuspensionsService {
  constructor(private readonly prisma: PrismaService) {}

  private actor(req: RequestWithAuth) {
    const role = req.auth?.role?.trim().toLowerCase();
    return { companyWide: !!role && COMPANY_WIDE_ROLES.has(role), clubId: req.auth?.clubId, uid: req.auth?.uid };
  }

  private async load(companyId: string, matchId: string) {
    const match = await this.prisma.match.findFirst({ where: { id: matchId, companyId }, include });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  private involvedClubs(match: { homeTeam: { clubId: string }; awayTeam: { clubId: string } }) {
    return [match.homeTeam.clubId, match.awayTeam.clubId];
  }

  async suspend(companyId: string, matchId: string, dto: SuspendMatchDto, req: RequestWithAuth) {
    const match = await this.load(companyId, matchId);
    const actor = this.actor(req);
    const involved = this.involvedClubs(match);

    let clubId = actor.clubId;
    if (actor.companyWide) {
      clubId = dto.clubId ?? undefined;
      if (clubId && !involved.includes(clubId)) throw new BadRequestException('El club no juega este partido');
    } else if (!clubId || !involved.includes(clubId)) {
      throw new ForbiddenException('Solo un club que juega el partido puede suspenderlo');
    }

    if (match.status === MatchStatus.played) throw new BadRequestException('El partido ya se jugó');
    const categories = Array.from(new Set((dto.categories ?? []).map((c) => c.trim()).filter(Boolean)));
    const whole = categories.length === 0;
    if (whole && match.suspensions.some((s) => s.state === 'open' && s.categories.length === 0)) {
      throw new BadRequestException('El partido ya está suspendido');
    }

    await this.prisma.$transaction([
      this.prisma.matchSuspension.create({
        data: { companyId, matchId, clubId, categories, reason: dto.reason.trim(), suspendedBy: actor.uid },
      }),
      ...(whole ? [this.prisma.match.update({ where: { id: matchId }, data: { status: MatchStatus.suspended } })] : []),
    ]);
    return this.load(companyId, matchId);
  }

  /** Reprograma la suspensión: si era total, el partido vuelve a programarse en la nueva fecha. */
  async reschedule(companyId: string, matchId: string, suspensionId: string, dto: RescheduleMatchDto, req: RequestWithAuth) {
    const match = await this.load(companyId, matchId);
    const actor = this.actor(req);
    // La fecha la define la liga o el club local; el visitante solo puede suspender.
    if (!actor.companyWide && actor.clubId !== match.homeTeam.clubId) {
      throw new ForbiddenException('Solo la liga o el club local pueden reprogramar');
    }
    const suspension = match.suspensions.find((s) => s.id === suspensionId);
    if (!suspension) throw new NotFoundException('Suspension not found');
    if (suspension.state !== 'open') throw new BadRequestException('La suspensión ya fue resuelta');
    if (dto.newDate.getTime() < Date.now() - 3600000) throw new BadRequestException('La nueva fecha debe ser futura');

    const whole = suspension.categories.length === 0;
    await this.prisma.$transaction([
      this.prisma.matchSuspension.update({
        where: { id: suspensionId },
        data: { state: 'rescheduled', newDate: dto.newDate, newVenue: dto.venue, rescheduleNote: dto.note, resolvedAt: new Date() },
      }),
      ...(whole
        ? [
            this.prisma.match.update({
              where: { id: matchId },
              data: {
                status: MatchStatus.scheduled,
                scheduledAt: dto.newDate,
                originalScheduledAt: match.originalScheduledAt ?? match.scheduledAt,
                ...(dto.venue ? { venue: dto.venue } : {}),
              },
            }),
          ]
        : []),
    ]);
    return this.load(companyId, matchId);
  }

  /** Deja sin efecto la suspensión (el partido se juega en su fecha original). */
  async lift(companyId: string, matchId: string, suspensionId: string, req: RequestWithAuth) {
    const match = await this.load(companyId, matchId);
    const actor = this.actor(req);
    const suspension = match.suspensions.find((s) => s.id === suspensionId);
    if (!suspension) throw new NotFoundException('Suspension not found');
    if (!actor.companyWide && (!actor.clubId || actor.clubId !== suspension.clubId)) {
      throw new ForbiddenException('Solo la liga o el club que suspendió puede levantarla');
    }
    if (suspension.state !== 'open') throw new BadRequestException('La suspensión ya fue resuelta');

    await this.prisma.$transaction([
      this.prisma.matchSuspension.update({ where: { id: suspensionId }, data: { state: 'lifted', resolvedAt: new Date() } }),
      ...(suspension.categories.length === 0
        ? [this.prisma.match.update({ where: { id: matchId }, data: { status: MatchStatus.scheduled } })]
        : []),
    ]);
    return this.load(companyId, matchId);
  }
}
