import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { FirestoreMigrationService } from './firestore-migration.service';
import {
  type Doc,
  disciplineData,
  divisionData,
  playerData,
  str,
  toDisciplineDoc,
  toDivisionDoc,
  toPlayerDoc,
} from './roster.mapper';

const STAFF_ROLES = new Set([
  'admin',
  'fed_admin',
  'league_admin',
  'municipal_admin',
  'municipal_secretary',
  'municipal_inspector',
  'manager',
  'club_admin',
  'coordinator',
  'coach',
  'coach_lvl1',
  'coach_lvl2',
]);

export type Viewer = {
  uid: string;
  role?: string | null;
  email?: string | null;
};

const PLAYER_INCLUDE = { division: { select: { name: true } } } as const;

function uniqueMessage(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  )
    return null;
  const raw = (error.meta as { target?: unknown } | undefined)?.target;
  const target = Array.isArray(raw)
    ? raw.join(',')
    : typeof raw === 'string'
      ? raw
      : '';
  if (target.includes('email')) return 'Ese email ya está en otra ficha.';
  if (target.includes('dni')) return 'Ya hay una ficha con ese DNI.';
  if (target.includes('authUid'))
    return 'Esa cuenta ya está vinculada a otra ficha.';
  if (target.includes('sportId'))
    return 'Esa disciplina ya está habilitada en el club.';
  return 'Ya existe un registro con esos datos.';
}

/** Disciplinas, ramas y padrón de jugadores de un club (antes en Firestore). */
@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: FirestoreMigrationService,
  ) {}

  private async club(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true, companyId: true, name: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    // El primer uso del club copia sus datos de Firestore.
    await this.migration.ensureStage1(clubId);
    return club;
  }

  private async write<T>(job: () => Promise<T>): Promise<T> {
    try {
      return await job();
    } catch (error) {
      const message = uniqueMessage(error);
      if (message) throw new ConflictException(message);
      throw error;
    }
  }

  // ─── Disciplinas ───────────────────────────────────────────────────────────

  async listDisciplines(companyId: string, clubId: string) {
    await this.club(companyId, clubId);
    const list = await this.prisma.clubDiscipline.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
    return list.map(toDisciplineDoc);
  }

  async getDiscipline(companyId: string, clubId: string, id: string) {
    await this.club(companyId, clubId);
    const item = await this.prisma.clubDiscipline.findFirst({
      where: { clubId, OR: [{ id }, { sportId: id }] },
    });
    if (!item) throw new NotFoundException('Disciplina no encontrada');
    return toDisciplineDoc(item);
  }

  async createDiscipline(companyId: string, clubId: string, fields: Doc) {
    const club = await this.club(companyId, clubId);
    const data = disciplineData(fields);
    const sportId = str(data.sportId, 60);
    if (!sportId) throw new BadRequestException('Falta el deporte');
    const created = await this.write(() =>
      this.prisma.clubDiscipline.create({
        data: {
          ...(data as Prisma.ClubDisciplineUncheckedCreateInput),
          id: sportId,
          sportId,
          name: (data.name as string) ?? sportId,
          companyId: club.companyId,
          clubId,
        },
      }),
    );
    await this.migration.syncClubSports(clubId);
    return toDisciplineDoc(created);
  }

  async updateDiscipline(
    companyId: string,
    clubId: string,
    id: string,
    fields: Doc,
  ) {
    await this.club(companyId, clubId);
    const current = await this.prisma.clubDiscipline.findFirst({
      where: { clubId, OR: [{ id }, { sportId: id }] },
    });
    if (!current) throw new NotFoundException('Disciplina no encontrada');
    const data = disciplineData(fields, current.extra);
    delete data.sportId; // el deporte de una disciplina no cambia
    const updated = await this.write(() =>
      this.prisma.clubDiscipline.update({ where: { id: current.id }, data }),
    );
    await this.migration.syncClubSports(clubId);
    return toDisciplineDoc(updated);
  }

  async deleteDiscipline(companyId: string, clubId: string, id: string) {
    await this.club(companyId, clubId);
    const current = await this.prisma.clubDiscipline.findFirst({
      where: { clubId, OR: [{ id }, { sportId: id }] },
    });
    if (!current) throw new NotFoundException('Disciplina no encontrada');
    await this.prisma.clubDiscipline.delete({ where: { id: current.id } });
    await this.migration.syncClubSports(clubId);
    return { ok: true };
  }

  // ─── Ramas ─────────────────────────────────────────────────────────────────

  async listDivisions(companyId: string, clubId: string, sport?: string) {
    await this.club(companyId, clubId);
    const list = await this.prisma.division.findMany({
      where: { clubId, ...(sport ? { sport } : {}) },
      orderBy: { name: 'asc' },
    });
    return list.map(toDivisionDoc);
  }

  async getDivision(companyId: string, clubId: string, id: string) {
    await this.club(companyId, clubId);
    const item = await this.prisma.division.findFirst({
      where: { id, clubId },
    });
    if (!item) throw new NotFoundException('Rama no encontrada');
    return toDivisionDoc(item);
  }

  async createDivision(companyId: string, clubId: string, fields: Doc) {
    const club = await this.club(companyId, clubId);
    const data = divisionData(fields);
    if (!data.name) throw new BadRequestException('Falta el nombre de la rama');
    const id = str(fields.id, 60) ?? undefined;
    const created = await this.write(() =>
      this.prisma.division.create({
        data: {
          ...(data as Prisma.DivisionUncheckedCreateInput),
          ...(id ? { id } : {}),
          name: data.name as string,
          companyId: club.companyId,
          clubId,
        },
      }),
    );
    return toDivisionDoc(created);
  }

  async updateDivision(
    companyId: string,
    clubId: string,
    id: string,
    fields: Doc,
  ) {
    await this.club(companyId, clubId);
    const current = await this.prisma.division.findFirst({
      where: { id, clubId },
    });
    if (!current) throw new NotFoundException('Rama no encontrada');
    const updated = await this.write(() =>
      this.prisma.division.update({
        where: { id },
        data: divisionData(fields, current.extra),
      }),
    );
    return toDivisionDoc(updated);
  }

  async deleteDivision(companyId: string, clubId: string, id: string) {
    await this.club(companyId, clubId);
    const current = await this.prisma.division.findFirst({
      where: { id, clubId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Rama no encontrada');
    await this.prisma.division.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Jugadores ─────────────────────────────────────────────────────────────

  private isStaff(viewer: Viewer) {
    return STAFF_ROLES.has((viewer.role ?? '').trim().toLowerCase());
  }

  async listPlayers(
    companyId: string,
    clubId: string,
    viewer: Viewer,
    filter: {
      divisionId?: string;
      teamId?: string;
      sport?: string;
      status?: string;
    },
  ) {
    if (!this.isStaff(viewer))
      throw new ForbiddenException('Solo el staff del club ve el padrón');
    await this.club(companyId, clubId);
    const list = await this.prisma.player.findMany({
      where: {
        clubId,
        companyId,
        ...(filter.divisionId ? { divisionId: filter.divisionId } : {}),
        ...(filter.sport ? { sport: filter.sport } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.teamId
          ? { extra: { path: ['teamId'], equals: filter.teamId } }
          : {}),
      },
      include: PLAYER_INCLUDE,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return list.map(toPlayerDoc);
  }

  private async findPlayer(companyId: string, clubId: string, id: string) {
    return this.prisma.player.findFirst({
      where: { clubId, companyId, OR: [{ id }, { legacyId: id }] },
      include: PLAYER_INCLUDE,
    });
  }

  private ownsPlayer(
    viewer: Viewer,
    player: {
      authUid: string | null;
      legacyId: string | null;
      id: string;
      email: string | null;
    },
  ) {
    return (
      player.authUid === viewer.uid ||
      player.legacyId === viewer.uid ||
      player.id === viewer.uid ||
      (Boolean(viewer.email) && player.email === viewer.email?.toLowerCase())
    );
  }

  async getPlayer(
    companyId: string,
    clubId: string,
    id: string,
    viewer: Viewer,
  ) {
    await this.club(companyId, clubId);
    const player = await this.findPlayer(companyId, clubId, id);
    if (!player) throw new NotFoundException('Jugador no encontrado');
    if (!this.isStaff(viewer) && !this.ownsPlayer(viewer, player))
      throw new ForbiddenException('No podés ver esta ficha');
    return toPlayerDoc(player);
  }

  /** La ficha del usuario que pregunta en este club (jugador o socio). */
  async myPlayer(companyId: string, clubId: string, viewer: Viewer) {
    await this.club(companyId, clubId);
    const email = viewer.email?.toLowerCase() ?? null;
    const player = await this.prisma.player.findFirst({
      where: {
        clubId,
        companyId,
        OR: [
          { authUid: viewer.uid },
          { legacyId: viewer.uid },
          { id: viewer.uid },
          ...(email ? [{ email }] : []),
        ],
      },
      include: PLAYER_INCLUDE,
    });
    if (!player) throw new NotFoundException('No tenés ficha en este club');
    return toPlayerDoc(player);
  }

  private async checkDivision(clubId: string, data: Record<string, unknown>) {
    const divisionId = data.divisionId;
    if (typeof divisionId !== 'string' || !divisionId) return;
    const exists = await this.prisma.division.findFirst({
      where: { id: divisionId, clubId },
      select: { id: true },
    });
    if (!exists)
      throw new BadRequestException('La rama elegida no existe en el club');
  }

  async createPlayer(companyId: string, clubId: string, fields: Doc) {
    await this.club(companyId, clubId);
    const data = playerData(fields);
    if (!data.firstName || !data.lastName)
      throw new BadRequestException('Falta el nombre y apellido');
    await this.checkDivision(clubId, data);
    // Un id propuesto por la consola (por ejemplo, el uid de la cuenta) se respeta.
    const id = str(fields.id, 128) ?? undefined;
    const created = await this.write(() =>
      this.prisma.player.create({
        data: {
          ...(data as Prisma.PlayerUncheckedCreateInput),
          ...(id ? { id } : {}),
          firstName: data.firstName as string,
          lastName: data.lastName as string,
          companyId,
          clubId,
        },
        include: PLAYER_INCLUDE,
      }),
    );
    return toPlayerDoc(created);
  }

  async updatePlayer(
    companyId: string,
    clubId: string,
    id: string,
    fields: Doc,
    viewer: Viewer,
  ) {
    await this.club(companyId, clubId);
    const current = await this.findPlayer(companyId, clubId, id);
    if (!current) throw new NotFoundException('Jugador no encontrado');
    let source = fields;
    if (!this.isStaff(viewer)) {
      // El propio jugador solo cambia su foto.
      if (!this.ownsPlayer(viewer, current))
        throw new ForbiddenException('No podés editar esta ficha');
      source = 'photoUrl' in fields ? { photoUrl: fields.photoUrl } : {};
    }
    const data = playerData(source, current.extra);
    await this.checkDivision(clubId, data);
    const updated = await this.write(() =>
      this.prisma.player.update({
        where: { id: current.id },
        data,
        include: PLAYER_INCLUDE,
      }),
    );
    return toPlayerDoc(updated);
  }

  async deletePlayer(companyId: string, clubId: string, id: string) {
    await this.club(companyId, clubId);
    const current = await this.findPlayer(companyId, clubId, id);
    if (!current) throw new NotFoundException('Jugador no encontrado');
    await this.prisma.player.delete({ where: { id: current.id } });
    return { ok: true };
  }
}
