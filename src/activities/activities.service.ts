import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  ClubDisciplinesService,
  DISCIPLINE_ID_PREFIX,
  type PublicDiscipline,
} from './club-disciplines.service';
import {
  CreateActivityDto,
  CreateInquiryDto,
  DisciplineSettingsDto,
  ScheduleSlotDto,
  UpdateActivityDto,
} from './dto/activity.dto';

const MAX_OPEN_INQUIRIES_PER_USER = 10;

const ACTIVITY_SELECT = {
  id: true,
  disciplineId: true,
  name: true,
  sport: true,
  audience: true,
  description: true,
  coaches: true,
  schedule: true,
  price: true,
  priceUnit: true,
  showPrice: true,
  isPublic: true,
  sortOrder: true,
  updatedAt: true,
} satisfies Prisma.ClubActivitySelect;

type ActivityRow = Prisma.ClubActivityGetPayload<{
  select: typeof ACTIVITY_SELECT;
}>;

/** Ordena y valida los horarios (fin posterior al inicio). */
export function normalizeSchedule(slots: ScheduleSlotDto[] | undefined) {
  if (!slots) return undefined;
  for (const slot of slots) {
    if (slot.end <= slot.start)
      throw new BadRequestException(
        'Cada horario tiene que terminar después de empezar.',
      );
  }
  return [...slots]
    .map(({ day, start, end }) => ({ day, start, end }))
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

function toNumber(row: ActivityRow) {
  return { ...row, price: row.price === null ? null : Number(row.price) };
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disciplines: ClubDisciplinesService,
  ) {}

  // ----- Consola del club -----

  /**
   * Pantalla única de la consola: las disciplinas del club (con su configuración
   * en la app) y las actividades sueltas.
   */
  async list(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    const [rows, disciplines] = await Promise.all([
      this.prisma.clubActivity.findMany({
        where: { companyId, clubId },
        select: ACTIVITY_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.disciplines.listPublic(clubId, true),
    ]);
    const settings = new Map(
      rows
        .filter((row) => row.disciplineId)
        .map((row) => [row.disciplineId, row]),
    );
    return {
      disciplines: disciplines.map((discipline) => {
        const row = settings.get(discipline.id);
        return {
          ...discipline,
          settings: {
            isPublic: row?.isPublic ?? true,
            description: row?.description ?? null,
            price: row?.price == null ? null : Number(row.price),
            priceUnit: row?.priceUnit ?? null,
            showPrice: row?.showPrice ?? false,
          },
        };
      }),
      activities: rows.filter((row) => !row.disciplineId).map(toNumber),
    };
  }

  /** Visibilidad, valor y texto en la app de una disciplina de la consola. */
  async saveDisciplineSettings(
    companyId: string,
    clubId: string,
    disciplineId: string,
    dto: DisciplineSettingsDto,
  ) {
    await this.requireClub(companyId, clubId);
    const discipline = await this.disciplines.exists(clubId, disciplineId);
    if (!discipline) throw new NotFoundException('Disciplina no encontrada');
    const data = {
      description: dto.description === '' ? null : dto.description,
      price: dto.price,
      priceUnit: dto.priceUnit,
      showPrice: dto.showPrice,
      isPublic: dto.isPublic,
    };
    await this.prisma.clubActivity.upsert({
      where: { clubId_disciplineId: { clubId, disciplineId } },
      create: {
        companyId,
        clubId,
        disciplineId,
        name: discipline.name,
        sport: discipline.sport,
        ...data,
      },
      update: { ...data, name: discipline.name },
    });
    return { ok: true };
  }

  async create(companyId: string, clubId: string, dto: CreateActivityDto) {
    await this.requireClub(companyId, clubId);
    const row = await this.prisma.clubActivity.create({
      data: { companyId, clubId, ...this.toData(dto), name: dto.name },
      select: ACTIVITY_SELECT,
    });
    return toNumber(row);
  }

  async update(
    companyId: string,
    clubId: string,
    id: string,
    dto: UpdateActivityDto,
  ) {
    await this.requireActivity(companyId, clubId, id);
    const row = await this.prisma.clubActivity.update({
      where: { id },
      data: this.toData(dto),
      select: ACTIVITY_SELECT,
    });
    return toNumber(row);
  }

  async remove(companyId: string, clubId: string, id: string) {
    await this.requireActivity(companyId, clubId, id);
    await this.prisma.clubActivity.delete({ where: { id } });
    return { ok: true };
  }

  listInquiries(
    companyId: string,
    clubId: string,
    status?: 'NEW' | 'CONTACTED' | 'CLOSED',
  ) {
    return this.prisma.activityInquiry.findMany({
      where: { companyId, clubId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        activity: { select: { id: true, name: true } },
        user: { select: { name: true, email: true, phone: true } },
      },
    });
  }

  async setInquiryStatus(
    companyId: string,
    clubId: string,
    id: string,
    status: 'NEW' | 'CONTACTED' | 'CLOSED',
  ) {
    const result = await this.prisma.activityInquiry.updateMany({
      where: { id, companyId, clubId },
      data: { status },
    });
    if (result.count === 0)
      throw new NotFoundException('Consulta no encontrada');
    return { ok: true };
  }

  // ----- App pública (usuarios con cuenta) -----

  /**
   * Actividades visibles en la app: primero las disciplinas de la consola (con
   * horarios por plantel), después las actividades sueltas. Precio solo si el
   * club lo muestra; profes solo si publica esa sección.
   */
  async listPublic(clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, isPublic: true, publicSchools: true },
      select: { publicCoaches: true },
    });
    if (!club) throw new NotFoundException('Sección no disponible');
    const [rows, disciplines] = await Promise.all([
      this.prisma.clubActivity.findMany({
        where: { clubId },
        select: ACTIVITY_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.disciplines.listPublic(clubId, club.publicCoaches),
    ]);
    const settings = new Map(
      rows
        .filter((row) => row.disciplineId)
        .map((row) => [row.disciplineId, row]),
    );
    const price = (row?: ActivityRow) =>
      row?.showPrice && row.price !== null
        ? { price: Number(row.price), priceUnit: row.priceUnit }
        : { price: null, priceUnit: null };

    const fromDisciplines = disciplines
      .filter((discipline) => settings.get(discipline.id)?.isPublic !== false)
      .map((discipline: PublicDiscipline) => {
        const row = settings.get(discipline.id);
        return {
          ...discipline,
          description: row?.description ?? discipline.description,
          schedule: [],
          ...price(row),
        };
      });
    const standalone = rows
      .filter((row) => !row.disciplineId && row.isPublic)
      .map((row) => ({
        id: row.id,
        kind: 'activity' as const,
        name: row.name,
        sport: row.sport,
        emoji: null,
        season: null,
        audience: row.audience,
        description: row.description,
        schedule: row.schedule,
        groups: [],
        coaches: club.publicCoaches ? row.coaches : [],
        ...price(row),
      }));
    return [...fromDisciplines, ...standalone];
  }

  /** "Consultar disponibilidad": una consulta abierta por usuario y actividad. */
  async createInquiry(firebaseUid: string, dto: CreateInquiryDto) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, name: true, phone: true },
    });
    if (!user) throw new UnauthorizedException('Perfil no registrado');
    if (!user.name?.trim() || !user.phone?.trim())
      throw new BadRequestException(
        'Completá tu nombre y celular en tu perfil para que el club pueda responderte.',
      );

    const activity = dto.activityId.startsWith(DISCIPLINE_ID_PREFIX)
      ? await this.disciplineForInquiry(dto.activityId, dto.clubId)
      : await this.prisma.clubActivity.findFirst({
          where: {
            id: dto.activityId,
            disciplineId: null,
            isPublic: true,
            club: { isPublic: true, publicSchools: true },
          },
          select: { id: true, clubId: true, companyId: true },
        });
    if (!activity) throw new NotFoundException('Actividad no encontrada');

    const open = await this.prisma.activityInquiry.findFirst({
      where: { userId: user.id, activityId: activity.id, status: 'NEW' },
      select: { id: true },
    });
    if (open) {
      await this.prisma.activityInquiry.update({
        where: { id: open.id },
        data: { message: dto.message || undefined },
      });
      return { id: open.id, status: 'NEW' as const, created: false };
    }

    const openCount = await this.prisma.activityInquiry.count({
      where: { userId: user.id, status: 'NEW' },
    });
    if (openCount >= MAX_OPEN_INQUIRIES_PER_USER)
      throw new ConflictException(
        'Tenés muchas consultas sin respuesta. Esperá a que los clubes te contacten.',
      );

    const inquiry = await this.prisma.activityInquiry.create({
      data: {
        companyId: activity.companyId,
        clubId: activity.clubId,
        activityId: activity.id,
        userId: user.id,
        message: dto.message || null,
      },
      select: { id: true, status: true },
    });
    return { ...inquiry, created: true };
  }

  async listMyInquiries(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Perfil no registrado');
    const rows = await this.prisma.activityInquiry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        createdAt: true,
        activityId: true,
        clubId: true,
        activity: { select: { name: true, disciplineId: true } },
        club: { select: { name: true } },
      },
    });
    // La app identifica las disciplinas como "disc_<id>".
    return rows.map(({ activity, ...row }) => ({
      ...row,
      activityId: activity.disciplineId ?? row.activityId,
      activity: { name: activity.name },
    }));
  }

  /** Fila de configuración de la disciplina (se crea al primer uso) para colgar la consulta. */
  private async disciplineForInquiry(disciplineId: string, clubId?: string) {
    if (!clubId)
      throw new BadRequestException('Falta el club de la disciplina.');
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, isPublic: true, publicSchools: true },
      select: { id: true, companyId: true },
    });
    if (!club) return null;
    const discipline = await this.disciplines.exists(clubId, disciplineId);
    if (!discipline) return null;
    const row = await this.prisma.clubActivity.upsert({
      where: { clubId_disciplineId: { clubId, disciplineId } },
      create: {
        companyId: club.companyId,
        clubId,
        disciplineId,
        name: discipline.name,
        sport: discipline.sport,
      },
      update: {},
      select: { id: true, clubId: true, companyId: true, isPublic: true },
    });
    return row.isPublic ? row : null;
  }

  // ----- helpers -----

  private toData(dto: UpdateActivityDto) {
    const schedule = normalizeSchedule(dto.schedule);
    return {
      name: dto.name,
      sport: dto.sport,
      audience: dto.audience === '' ? null : dto.audience,
      description: dto.description === '' ? null : dto.description,
      coaches: dto.coaches?.map((name) => name.trim()).filter(Boolean),
      schedule: schedule as Prisma.InputJsonValue | undefined,
      price: dto.price,
      priceUnit: dto.priceUnit,
      showPrice: dto.showPrice,
      isPublic: dto.isPublic,
      sortOrder: dto.sortOrder,
    };
  }

  private async requireClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
  }

  private async requireActivity(companyId: string, clubId: string, id: string) {
    const activity = await this.prisma.clubActivity.findFirst({
      where: { id, companyId, clubId, disciplineId: null },
      select: { id: true },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
  }
}
