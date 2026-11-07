import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { buildDemo, demoPrefix, LatLng } from './municipal-demo-data';

@Injectable()
export class MunicipalDemoService {
  constructor(private readonly prisma: PrismaService) {}

  private async municipality(companyId: string, id: string) {
    const m = await this.prisma.municipality.findFirst({ where: { id, companyId } });
    if (!m) throw new NotFoundException('Municipality not found');
    return m;
  }

  /** Borra solo lo creado por la demo (ids con prefijo). Los clubes arrastran jugadores, equipos, instalaciones, documentos y pedidos. */
  async clear(companyId: string, municipalityId: string) {
    await this.municipality(companyId, municipalityId);
    const startsWith = demoPrefix(municipalityId);
    const [projects, announcements, clubs] = await this.prisma.$transaction([
      this.prisma.municipalProject.deleteMany({ where: { municipalityId, id: { startsWith } } }),
      this.prisma.municipalAnnouncement.deleteMany({ where: { municipalityId, id: { startsWith } } }),
      this.prisma.club.deleteMany({ where: { companyId, municipalityId, id: { startsWith } } }),
    ]);
    return { removed: { clubs: clubs.count, projects: projects.count, announcements: announcements.count } };
  }

  async seed(companyId: string, municipalityId: string) {
    const m = await this.municipality(companyId, municipalityId);
    const boundary = Array.isArray(m.boundary) ? (m.boundary as unknown as LatLng[]).filter((p) => Array.isArray(p) && p.length === 2) : [];
    const center: LatLng | null =
      m.centerLat != null && m.centerLng != null
        ? [m.centerLat, m.centerLng]
        : boundary.length >= 3
          ? [boundary.reduce((a, p) => a + p[0], 0) / boundary.length, boundary.reduce((a, p) => a + p[1], 0) / boundary.length]
          : null;
    if (!center) {
      throw new BadRequestException('Definí primero el contorno del municipio en Territorio (o su centro) para ubicar los datos de demostración');
    }

    await this.clear(companyId, municipalityId);
    const d = buildDemo({ municipalityId, municipalityName: m.name, companyId, center, boundary });

    await this.prisma.$transaction(
      [
        this.prisma.club.createMany({ data: d.clubs }),
        this.prisma.team.createMany({ data: d.teams }),
        this.prisma.player.createMany({ data: d.players }),
        this.prisma.facility.createMany({ data: d.facilities }),
        this.prisma.clubDocument.createMany({ data: d.documents }),
        this.prisma.clubRequest.createMany({ data: d.requests }),
        this.prisma.municipalProject.createMany({ data: d.projects.map((p) => p.project) }),
        this.prisma.municipalProjectLine.createMany({ data: d.projects.flatMap((p) => p.lines) }),
        this.prisma.municipalProjectEvent.createMany({ data: d.projects.flatMap((p) => p.events) }),
        this.prisma.municipalAnnouncement.createMany({ data: d.announcements }),
      ],
      { timeout: 60_000 },
    );

    return {
      created: { clubs: d.clubs.length, players: d.players.length, facilities: d.facilities.length, projects: d.projects.length, requests: d.requests.length, documents: d.documents.length, announcements: d.announcements.length },
    };
  }
}
