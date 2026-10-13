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
  CreateActivityDto,
  CreateInquiryDto,
  ScheduleSlotDto,
  UpdateActivityDto,
} from './dto/activity.dto';

const MAX_OPEN_INQUIRIES_PER_USER = 10;

const ACTIVITY_SELECT = {
  id: true,
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
  constructor(private readonly prisma: PrismaService) {}

  // ----- Consola del club -----

  async list(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    const rows = await this.prisma.clubActivity.findMany({
      where: { companyId, clubId },
      select: ACTIVITY_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toNumber);
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

  /** Actividades visibles: precio solo si el club lo muestra; profes solo si publica la sección. */
  async listPublic(clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, isPublic: true, publicSchools: true },
      select: { publicCoaches: true },
    });
    if (!club) throw new NotFoundException('Sección no disponible');
    const rows = await this.prisma.clubActivity.findMany({
      where: { clubId, isPublic: true },
      select: ACTIVITY_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sport: row.sport,
      audience: row.audience,
      description: row.description,
      schedule: row.schedule,
      coaches: club.publicCoaches ? row.coaches : [],
      price: row.showPrice && row.price !== null ? Number(row.price) : null,
      priceUnit: row.showPrice ? row.priceUnit : null,
    }));
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

    const activity = await this.prisma.clubActivity.findFirst({
      where: {
        id: dto.activityId,
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
    return this.prisma.activityInquiry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        createdAt: true,
        activityId: true,
        clubId: true,
        activity: { select: { name: true } },
        club: { select: { name: true } },
      },
    });
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
      where: { id, companyId, clubId },
      select: { id: true },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
  }
}
