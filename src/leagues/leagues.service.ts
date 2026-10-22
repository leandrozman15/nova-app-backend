import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
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

  async listAnnouncements(companyId: string, leagueId: string) {
    await this.getById(companyId, leagueId);
    return this.prisma.leagueAnnouncement.findMany({
      where: { leagueId, companyId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async createAnnouncement(companyId: string, leagueId: string, dto: CreateAnnouncementDto) {
    await this.getById(companyId, leagueId);
    return this.prisma.leagueAnnouncement.create({
      data: { leagueId, companyId, title: dto.title, body: dto.body, pinned: dto.pinned ?? false },
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
