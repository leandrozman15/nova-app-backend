import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';

import { COMPANY_WIDE_ROLES } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleChangeDto } from './dto/schedule-change.dto';

/** Calcula el nuevo horario y el tipo de cambio (puro, para testear). */
export function computeScheduleChange(current: Date, dto: { minutes?: number; newDate?: Date }, now = new Date()) {
  const hasMinutes = dto.minutes !== undefined && dto.minutes !== 0;
  if (hasMinutes === (dto.newDate !== undefined)) {
    throw new BadRequestException('Indicá minutos de atraso/adelanto o una fecha nueva (solo una)');
  }
  const newAt = hasMinutes ? new Date(current.getTime() + dto.minutes! * 60_000) : dto.newDate!;
  if (Number.isNaN(newAt.getTime())) throw new BadRequestException('Fecha inválida');
  if (newAt.getTime() < now.getTime() - 60 * 60_000) throw new BadRequestException('El nuevo horario ya pasó');
  const deltaMinutes = Math.round((newAt.getTime() - current.getTime()) / 60_000);
  if (deltaMinutes === 0) throw new BadRequestException('El horario no cambia');
  const kind = hasMinutes ? (deltaMinutes > 0 ? 'delay' : 'advance') : 'reschedule';
  return { newAt, deltaMinutes, kind };
}

@Injectable()
export class MatchScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async change(companyId: string, matchId: string, dto: ScheduleChangeDto, req: RequestWithAuth) {
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, companyId },
      include: { homeTeam: { select: { clubId: true } } },
    });
    if (!match) throw new NotFoundException('Partido no encontrado');

    // La liga o el club local definen el horario; el visitante no.
    const role = req.auth?.role?.trim().toLowerCase();
    const companyWide = !!role && COMPANY_WIDE_ROLES.has(role);
    if (!companyWide && req.auth?.clubId !== match.homeTeam.clubId) {
      throw new ForbiddenException('Solo la liga o el club local pueden cambiar el horario');
    }
    if (match.status !== MatchStatus.scheduled) {
      throw new BadRequestException('Solo se puede cambiar el horario de un partido programado');
    }

    const { newAt, deltaMinutes, kind } = computeScheduleChange(match.scheduledAt, dto);
    await this.prisma.$transaction([
      this.prisma.matchScheduleChange.create({
        data: {
          companyId,
          matchId,
          kind,
          previousAt: match.scheduledAt,
          newAt,
          deltaMinutes,
          reason: dto.reason?.trim() || null,
          createdBy: req.auth?.uid,
        },
      }),
      this.prisma.match.update({
        where: { id: matchId },
        data: { scheduledAt: newAt, originalScheduledAt: match.originalScheduledAt ?? match.scheduledAt },
      }),
    ]);
    return this.prisma.match.findFirst({
      where: { id: matchId, companyId },
      include: { homeTeam: { select: { id: true, name: true, clubId: true } }, awayTeam: { select: { id: true, name: true, clubId: true } } },
    });
  }
}
