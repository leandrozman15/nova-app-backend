import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCompetitionDto,
  CreateEventDto,
  CreateWorkoutDto,
  SaveTimesDto,
  UpdateCompetitionDto,
  UpdateTimeDto,
} from './dto/swimming.dto';
import { isValidEvent, personalBests, rankResults, validSplits } from './swim-rules';
import { isValidWorkoutDistance, summarizeWorkout, workoutEntriesProblem } from './workout-rules';

@Injectable()
export class SwimmingService {
  constructor(private readonly prisma: PrismaService) {}

  private async club(companyId: string, clubId: string) {
    const c = await this.prisma.club.findFirst({ where: { id: clubId, companyId }, select: { id: true } });
    if (!c) throw new NotFoundException('Club not found');
  }

  private async competition(companyId: string, id: string) {
    const c = await this.prisma.swimCompetition.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Competition not found');
    return c;
  }

  listCompetitions(companyId: string, clubId: string) {
    return this.prisma.swimCompetition.findMany({
      where: { companyId, clubId },
      orderBy: { date: 'desc' },
      include: { _count: { select: { events: true } } },
    });
  }

  async createCompetition(companyId: string, dto: CreateCompetitionDto) {
    await this.club(companyId, dto.clubId);
    return this.prisma.swimCompetition.create({
      data: {
        companyId,
        clubId: dto.clubId,
        name: dto.name.trim(),
        date: new Date(dto.date),
        venue: dto.venue,
        poolLength: dto.poolLength ?? 25,
        clubTournamentId: dto.clubTournamentId,
        notes: dto.notes,
      },
    });
  }

  async updateCompetition(companyId: string, id: string, dto: UpdateCompetitionDto) {
    await this.competition(companyId, id);
    return this.prisma.swimCompetition.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  async removeCompetition(companyId: string, id: string) {
    await this.competition(companyId, id);
    await this.prisma.swimCompetition.delete({ where: { id } });
    return { ok: true };
  }

  /** Competencia con sus pruebas y, en cada una, los resultados ya ordenados con su posición. */
  async getCompetition(companyId: string, id: string) {
    const comp = await this.competition(companyId, id);
    const events = await this.prisma.swimEvent.findMany({ where: { competitionId: id }, orderBy: { position: 'asc' } });
    const times = await this.prisma.swimTime.findMany({
      where: { companyId, eventId: { in: events.map((e) => e.id) } },
      include: { player: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...comp,
      events: events.map((e) => ({
        ...e,
        results: rankResults(times.filter((t) => t.eventId === e.id)).sort(
          (a, b) => (a.place ?? 9999) - (b.place ?? 9999),
        ),
      })),
    };
  }

  async addEvent(companyId: string, competitionId: string, dto: CreateEventDto) {
    await this.competition(companyId, competitionId);
    if (!isValidEvent(dto.stroke, dto.distance)) {
      throw new BadRequestException('Esa combinación de estilo y distancia no existe');
    }
    const last = await this.prisma.swimEvent.findFirst({
      where: { competitionId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return this.prisma.swimEvent.create({
      data: {
        companyId,
        competitionId,
        stroke: dto.stroke,
        distance: dto.distance,
        gender: dto.gender ?? 'X',
        category: dto.category,
        position: (last?.position ?? -1) + 1,
      },
    });
  }

  async removeEvent(companyId: string, eventId: string) {
    const e = await this.prisma.swimEvent.findFirst({ where: { id: eventId, companyId }, select: { id: true } });
    if (!e) throw new NotFoundException('Event not found');
    await this.prisma.swimEvent.delete({ where: { id: eventId } });
    return { ok: true };
  }

  /** Guarda de una vez los tiempos de varios carriles (misma prueba, mismo momento). */
  async saveTimes(companyId: string, dto: SaveTimesDto) {
    await this.club(companyId, dto.clubId);
    if (!isValidEvent(dto.stroke, dto.distance)) {
      throw new BadRequestException('Esa combinación de estilo y distancia no existe');
    }
    if (dto.entries.length === 0) throw new BadRequestException('No hay tiempos para guardar');
    if (dto.eventId) {
      const ev = await this.prisma.swimEvent.findFirst({ where: { id: dto.eventId, companyId } });
      if (!ev) throw new NotFoundException('Event not found');
    }
    const ids = [...new Set(dto.entries.map((e) => e.playerId))];
    const players = await this.prisma.player.findMany({
      where: { id: { in: ids }, companyId, clubId: dto.clubId },
      select: { id: true },
    });
    if (players.length !== ids.length) throw new BadRequestException('Hay deportistas que no son de este club');
    for (const e of dto.entries) {
      const status = e.status ?? 'ok';
      if (status === 'ok' && e.timeMs <= 0) throw new BadRequestException('Un tiempo válido debe ser mayor a cero');
      if (!validSplits(e.splits ?? [], e.timeMs)) throw new BadRequestException('Los parciales no son válidos');
    }
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    const created = await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.swimTime.create({
          data: {
            companyId,
            clubId: dto.clubId,
            playerId: e.playerId,
            stroke: dto.stroke,
            distance: dto.distance,
            poolLength: dto.poolLength ?? 25,
            timeMs: (e.status ?? 'ok') === 'ok' ? e.timeMs : 0,
            splits: (e.splits ?? []) as Prisma.InputJsonValue,
            status: e.status ?? 'ok',
            source: dto.eventId ? 'meet' : (dto.source ?? 'training'),
            eventId: dto.eventId,
            lane: e.lane,
            heat: e.heat,
            note: e.note,
            recordedAt,
          },
        }),
      ),
    );
    return { saved: created.length };
  }

  listTimes(companyId: string, q: { clubId: string; playerId?: string; stroke?: string; distance?: number; limit: number }) {
    return this.prisma.swimTime.findMany({
      where: {
        companyId,
        clubId: q.clubId,
        ...(q.playerId && { playerId: q.playerId }),
        ...(q.stroke && { stroke: q.stroke }),
        ...(q.distance && { distance: q.distance }),
      },
      include: { player: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { recordedAt: 'desc' },
      take: q.limit,
    });
  }

  async updateTime(companyId: string, id: string, dto: UpdateTimeDto) {
    const t = await this.prisma.swimTime.findFirst({ where: { id, companyId } });
    if (!t) throw new NotFoundException('Time not found');
    const status = dto.status ?? t.status;
    const timeMs = status === 'ok' ? (dto.timeMs ?? t.timeMs) : 0;
    if (status === 'ok' && timeMs <= 0) throw new BadRequestException('Un tiempo válido debe ser mayor a cero');
    return this.prisma.swimTime.update({ where: { id }, data: { status, timeMs, note: dto.note } });
  }

  async removeTime(companyId: string, id: string) {
    const t = await this.prisma.swimTime.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!t) throw new NotFoundException('Time not found');
    await this.prisma.swimTime.delete({ where: { id } });
    return { ok: true };
  }

  async records(companyId: string, clubId: string) {
    const rows = await this.prisma.swimTime.findMany({
      // Las repeticiones de los entrenamientos cronometrados no son marcas: tienen su propio resumen.
      where: { companyId, clubId, status: 'ok', workoutId: null },
      select: { playerId: true, stroke: true, distance: true, poolLength: true, timeMs: true, status: true, recordedAt: true },
    });
    return personalBests(rows);
  }

  // ─── Entrenamientos cronometrados ──────────────────────────────────────────

  async createWorkout(companyId: string, dto: CreateWorkoutDto, createdBy?: string) {
    await this.club(companyId, dto.clubId);
    if (!isValidWorkoutDistance(dto.distance)) throw new BadRequestException('La distancia tiene que ser de 25 en 25 metros');
    const entries = dto.entries.map((e) => ({ ...e, status: e.status ?? 'ok' }));
    if (entries.length === 0) throw new BadRequestException('No hay tiempos para guardar');
    const problem = workoutEntriesProblem(entries, dto.reps);
    if (problem) throw new BadRequestException(problem);
    const ids = [...new Set(entries.map((e) => e.playerId))];
    const players = await this.prisma.player.findMany({
      where: { id: { in: ids }, companyId, clubId: dto.clubId },
      select: { id: true },
    });
    if (players.length !== ids.length) throw new BadRequestException('Hay deportistas que no son de este club');
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    const poolLength = dto.poolLength ?? 25;
    return this.prisma.$transaction(async (tx) => {
      const workout = await tx.swimWorkout.create({
        data: {
          companyId,
          clubId: dto.clubId,
          teamId: dto.teamId,
          divisionId: dto.divisionId,
          name: dto.name?.trim() || `${dto.reps} × ${dto.distance} m`,
          stroke: dto.stroke,
          distance: dto.distance,
          reps: dto.reps,
          intervalSec: dto.intervalSec,
          poolLength,
          notes: dto.notes,
          createdBy,
          recordedAt,
        },
      });
      await tx.swimTime.createMany({
        data: entries.map((e) => ({
          companyId,
          clubId: dto.clubId,
          playerId: e.playerId,
          stroke: dto.stroke,
          distance: dto.distance,
          poolLength,
          timeMs: e.status === 'ok' ? e.timeMs : 0,
          status: e.status,
          source: 'training',
          workoutId: workout.id,
          rep: e.rep,
          recordedAt,
        })),
      });
      return { id: workout.id, saved: entries.length };
    });
  }

  async listWorkouts(companyId: string, q: { clubId: string; teamId?: string; playerId?: string; limit: number }) {
    const rows = await this.prisma.swimWorkout.findMany({
      where: {
        companyId,
        clubId: q.clubId,
        ...(q.teamId && { teamId: q.teamId }),
        ...(q.playerId && { times: { some: { playerId: q.playerId } } }),
      },
      include: {
        times: {
          ...(q.playerId && { where: { playerId: q.playerId } }),
          select: { playerId: true, rep: true, timeMs: true, status: true },
        },
      },
      orderBy: { recordedAt: 'desc' },
      take: q.limit,
    });
    return rows.map(({ times, ...w }) => {
      const summary = summarizeWorkout(times.map((t) => ({ ...t, rep: t.rep ?? 0 })), w.reps);
      return { ...w, swimmers: summary.length, summary: q.playerId ? summary : undefined };
    });
  }

  async getWorkout(companyId: string, id: string) {
    const w = await this.prisma.swimWorkout.findFirst({
      where: { id, companyId },
      include: {
        times: {
          select: { playerId: true, rep: true, timeMs: true, status: true, player: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!w) throw new NotFoundException('Workout not found');
    const names = new Map(w.times.map((t) => [t.playerId, `${t.player.firstName} ${t.player.lastName}`.trim()]));
    const { times, ...rest } = w;
    const summary = summarizeWorkout(times.map((t) => ({ ...t, rep: t.rep ?? 0 })), w.reps)
      .map((s) => ({ ...s, name: names.get(s.playerId) ?? '' }))
      .sort((a, b) => (a.avgMs ?? Infinity) - (b.avgMs ?? Infinity));
    return { ...rest, summary };
  }

  async removeWorkout(companyId: string, id: string) {
    const w = await this.prisma.swimWorkout.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!w) throw new NotFoundException('Workout not found');
    await this.prisma.swimWorkout.delete({ where: { id } });
    return { ok: true };
  }
}
