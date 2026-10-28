import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TakeAttendanceDto } from './dto/take-attendance.dto';

type Counts = { present: number; late: number; absent: number; justified: number };

export function emptyCounts(): Counts {
  return { present: 0, late: 0, absent: 0, justified: 0 };
}

/** % de asistencia: presentes + tardanzas sobre el total de entrenamientos registrados (justificadas no penalizan). */
export function attendancePercent(c: Counts): number {
  const considered = c.present + c.late + c.absent;
  if (considered === 0) return 0;
  return Math.round(((c.present + c.late) / considered) * 100);
}

export function monthRange(month: string): { from: Date; to: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BadRequestException('month debe ser YYYY-MM');
  }
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async take(companyId: string, takenBy: string | undefined, dto: TakeAttendanceDto) {
    const date = new Date(`${dto.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Fecha inválida');

    const club = await this.prisma.club.findFirst({ where: { id: dto.clubId, companyId }, select: { id: true } });
    if (!club) throw new BadRequestException('Club inexistente');

    const refs = [...new Set(dto.records.map((r) => r.playerId))];
    const players = refs.length
      ? await this.prisma.player.findMany({
          where: { companyId, clubId: dto.clubId, OR: [{ id: { in: refs } }, { legacyId: { in: refs } }] },
          select: { id: true, legacyId: true },
        })
      : [];
    const canonical = new Map<string, string>();
    for (const p of players) {
      canonical.set(p.id, p.id);
      if (p.legacyId) canonical.set(p.legacyId, p.id);
    }

    const session = await this.prisma.attendanceSession.upsert({
      where: { clubId_teamId_date: { clubId: dto.clubId, teamId: dto.teamId, date } },
      create: { companyId, clubId: dto.clubId, teamId: dto.teamId, divisionId: dto.divisionId, date, takenBy },
      update: { divisionId: dto.divisionId, takenBy },
    });

    const latest = new Map<string, string>();
    for (const r of dto.records) {
      const id = canonical.get(r.playerId);
      if (id) latest.set(id, r.status);
    }
    await this.prisma.$transaction([
      this.prisma.attendanceRecord.deleteMany({ where: { sessionId: session.id } }),
      this.prisma.attendanceRecord.createMany({
        data: [...latest.entries()].map(([playerId, status]) => ({ sessionId: session.id, playerId, status })),
      }),
    ]);
    return this.getSession(companyId, dto.clubId, dto.teamId, dto.date);
  }

  async getSession(companyId: string, clubId: string, teamId: string, date: string) {
    const day = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) throw new BadRequestException('Fecha inválida');
    const session = await this.prisma.attendanceSession.findFirst({
      where: { companyId, clubId, teamId, date: day },
      include: { records: { select: { playerId: true, status: true, player: { select: { legacyId: true } } } } },
    });
    return session
      ? {
          id: session.id,
          date,
          teamId,
          records: session.records.map((r) => ({
            playerId: r.playerId,
            legacyId: r.player.legacyId ?? null,
            status: r.status,
          })),
        }
      : { id: null, date, teamId, records: [] };
  }

  /** Resumen mensual por jugador (con % de asistencia) para un club, opcionalmente filtrado por división/equipo. */
  async summary(
    companyId: string,
    clubId: string,
    month: string,
    filter: { divisionId?: string; teamId?: string },
  ) {
    const { from, to } = monthRange(month);
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        companyId,
        clubId,
        date: { gte: from, lt: to },
        ...(filter.divisionId ? { divisionId: filter.divisionId } : {}),
        ...(filter.teamId ? { teamId: filter.teamId } : {}),
      },
      include: { records: true },
      orderBy: { date: 'asc' },
    });

    const playerIds = [...new Set(sessions.flatMap((s) => s.records.map((r) => r.playerId)))];
    const players = playerIds.length
      ? await this.prisma.player.findMany({
          where: { id: { in: playerIds } },
          select: { id: true, legacyId: true, firstName: true, lastName: true, photoUrl: true },
        })
      : [];
    const byId = new Map(players.map((p) => [p.id, p]));

    const perPlayer = new Map<string, { counts: Counts; teamId: string; divisionId: string | null; days: Record<string, string> }>();
    for (const s of sessions) {
      const day = s.date.toISOString().slice(0, 10);
      for (const r of s.records) {
        const entry = perPlayer.get(r.playerId) ?? { counts: emptyCounts(), teamId: s.teamId, divisionId: s.divisionId, days: {} };
        if (r.status in entry.counts) entry.counts[r.status as keyof Counts] += 1;
        entry.days[day] = r.status;
        entry.teamId = s.teamId;
        entry.divisionId = s.divisionId;
        perPlayer.set(r.playerId, entry);
      }
    }

    const rows = [...perPlayer.entries()]
      .map(([playerId, e]) => {
        const p = byId.get(playerId);
        const total = e.counts.present + e.counts.late + e.counts.absent + e.counts.justified;
        return {
          playerId,
          legacyId: p?.legacyId ?? null,
          name: p ? `${p.lastName} ${p.firstName}`.trim() : playerId,
          photoUrl: p?.photoUrl ?? null,
          teamId: e.teamId,
          divisionId: e.divisionId,
          ...e.counts,
          total,
          percent: attendancePercent(e.counts),
          days: e.days,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const totals = emptyCounts();
    for (const r of rows) {
      totals.present += r.present;
      totals.late += r.late;
      totals.absent += r.absent;
      totals.justified += r.justified;
    }
    return {
      month,
      sessions: sessions.map((s) => ({ id: s.id, date: s.date.toISOString().slice(0, 10), teamId: s.teamId, divisionId: s.divisionId })),
      rows,
      percent: attendancePercent(totals),
    };
  }

  /** Asistencia del propio jugador (ficha vinculada a su cuenta). */
  async mine(companyId: string, firebaseUid: string, month: string) {
    const { from, to } = monthRange(month);
    const player = await this.prisma.player.findFirst({
      where: { companyId, authUid: firebaseUid },
      select: { id: true },
    });
    if (!player) throw new ForbiddenException('No hay ficha de jugador vinculada a tu cuenta');
    const records = await this.prisma.attendanceRecord.findMany({
      where: { playerId: player.id, session: { companyId, date: { gte: from, lt: to } } },
      include: { session: { select: { date: true } } },
      orderBy: { session: { date: 'asc' } },
    });
    const counts = emptyCounts();
    for (const r of records) if (r.status in counts) counts[r.status as keyof Counts] += 1;
    return {
      month,
      ...counts,
      total: records.length,
      percent: attendancePercent(counts),
      days: records.map((r) => ({ date: r.session.date.toISOString().slice(0, 10), status: r.status })),
    };
  }
}
