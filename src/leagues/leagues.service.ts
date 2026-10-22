import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateLeagueTournamentDto, UpdateLeagueTournamentDto } from './dto/league-tournament.dto';
import { CreateLeagueDto } from './dto/create-league.dto';
import { UpdateLeagueDto } from './dto/update-league.dto';

@Injectable()
export class LeaguesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.league.findMany({
      where: { companyId },
      include: { club: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const league = await this.prisma.league.findFirst({
      where: { id, companyId },
      include: { club: true },
    });

    if (!league) {
      throw new NotFoundException('League not found');
    }

    return league;
  }

  /** Padrón de jugadores federados de los clubes afiliados: solo lectura y sin datos de contacto. */
  async listFederatedPlayers(companyId: string, leagueId: string) {
    await this.getById(companyId, leagueId);
    return this.prisma.player.findMany({
      where: { companyId, isFan: false, club: { leagueId } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dni: true,
        birthDate: true,
        gender: true,
        sport: true,
        branch: true,
        position: true,
        status: true,
        active: true,
        hasMedicalCert: true,
        photoUrl: true,
        clubId: true,
        club: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private readonly tournamentInclude = {
    clubs: { include: { club: { select: { id: true, name: true } } } },
  } as const;

  async listTournaments(companyId: string, leagueId: string) {
    await this.getById(companyId, leagueId);
    return this.prisma.leagueTournament.findMany({
      where: { leagueId, companyId },
      include: this.tournamentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Solo admite clubes afiliados a la liga. */
  private async validClubIds(companyId: string, leagueId: string, clubIds: string[]) {
    const unique = Array.from(new Set(clubIds));
    if (unique.length === 0) return [];
    const found = await this.prisma.club.findMany({
      where: { id: { in: unique }, companyId, leagueId },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('Hay clubes que no pertenecen a la liga');
    }
    return unique;
  }

  async createTournament(companyId: string, leagueId: string, dto: CreateLeagueTournamentDto) {
    await this.getById(companyId, leagueId);
    const clubIds = await this.validClubIds(companyId, leagueId, dto.clubIds ?? []);
    return this.prisma.leagueTournament.create({
      data: {
        leagueId,
        companyId,
        name: dto.name,
        kind: dto.kind ?? 'regular',
        category: dto.category,
        format: dto.format,
        description: dto.description,
        status: dto.status ?? 'draft',
        formatType: dto.formatType ?? 'league',
        groupCount: dto.groupCount,
        advancePerGroup: dto.advancePerGroup,
        thirdPlace: dto.thirdPlace ?? false,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        clubs: { create: clubIds.map((clubId) => ({ clubId })) },
      },
      include: this.tournamentInclude,
    });
  }

  async updateTournament(companyId: string, leagueId: string, id: string, dto: UpdateLeagueTournamentDto) {
    const existing = await this.prisma.leagueTournament.findFirst({ where: { id, leagueId, companyId } });
    if (!existing) throw new NotFoundException('Tournament not found');
    if (dto.formatType && dto.formatType !== existing.formatType) {
      const matches = await this.prisma.match.count({ where: { tournamentId: id } });
      if (matches > 0) throw new BadRequestException('No se puede cambiar el formato con partidos creados');
    }
    const clubIds = dto.clubIds ? await this.validClubIds(companyId, leagueId, dto.clubIds) : null;
    const { clubIds: _ignored, startDate, endDate, ...rest } = dto;
    return this.prisma.leagueTournament.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
        ...(clubIds
          ? { clubs: { deleteMany: {}, create: clubIds.map((clubId) => ({ clubId })) } }
          : {}),
      },
      include: this.tournamentInclude,
    });
  }

  async removeTournament(companyId: string, leagueId: string, id: string) {
    const { count } = await this.prisma.leagueTournament.deleteMany({ where: { id, leagueId, companyId } });
    if (!count) throw new NotFoundException('Tournament not found');
    return { ok: true };
  }

  /** Con `clubId` devuelve solo lo dirigido a ese club o a todos. */
  async listAnnouncements(companyId: string, leagueId: string, clubId?: string) {
    await this.getById(companyId, leagueId);
    return this.prisma.leagueAnnouncement.findMany({
      where: {
        leagueId,
        companyId,
        ...(clubId ? { OR: [{ clubIds: { isEmpty: true } }, { clubIds: { has: clubId } }] } : {}),
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async createAnnouncement(companyId: string, leagueId: string, dto: CreateAnnouncementDto) {
    await this.getById(companyId, leagueId);
    const clubIds = await this.validClubIds(companyId, leagueId, dto.clubIds ?? []);
    return this.prisma.leagueAnnouncement.create({
      data: { leagueId, companyId, title: dto.title, body: dto.body, pinned: dto.pinned ?? false, clubIds },
    });
  }

  async removeAnnouncement(companyId: string, leagueId: string, announcementId: string) {
    const { count } = await this.prisma.leagueAnnouncement.deleteMany({
      where: { id: announcementId, leagueId, companyId },
    });
    if (!count) throw new NotFoundException('Announcement not found');
    return { ok: true };
  }

  create(companyId: string, dto: CreateLeagueDto) {
    return this.prisma.league.create({
      data: {
        companyId,
        name: dto.name,
        season: dto.season,
        clubId: dto.clubId,
        municipalityId: dto.municipalityId,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateLeagueDto) {
    await this.getById(companyId, id);

    return this.prisma.league.update({
      where: { id },
      data: {
        name: dto.name,
        season: dto.season,
        clubId: dto.clubId,
        municipalityId: dto.municipalityId,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.league.delete({ where: { id } });

    return { ok: true };
  }
}
