import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type TournamentStatus } from '@prisma/client';

import { addDays, todayIn } from '../bookings/booking-time';
import { facilitySportFamily } from '../facilities/facility-sports';
import { PlatformService } from '../platform/platform.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEntryDto,
  CreateTournamentDto,
  ListPublicTournamentsDto,
  ReviewEntryDto,
  TournamentDayDto,
  TournamentVenueDto,
  UpdateTournamentDto,
} from './dto/tournament.dto';

const ACTIVE_ENTRY = ['PENDING', 'ACCEPTED'] as const;
const VISIBLE: TournamentStatus[] = ['PUBLISHED', 'CLOSED'];
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

const TOURNAMENT_SELECT = {
  id: true,
  clubId: true,
  name: true,
  sport: true,
  variant: true,
  category: true,
  entryType: true,
  description: true,
  days: true,
  venues: true,
  organizers: true,
  contactPhone: true,
  contactEmail: true,
  registrationFee: true,
  feeUnit: true,
  registrationDeadline: true,
  maxEntries: true,
  prizes: true,
  rules: true,
  status: true,
  startDate: true,
  endDate: true,
  publishedAt: true,
  updatedAt: true,
} satisfies Prisma.ClubTournamentSelect;

type TournamentRow = Prisma.ClubTournamentGetPayload<{
  select: typeof TOURNAMENT_SELECT;
}>;

/** Ordena días, valida horarios y devuelve primer y último día. */
export function normalizeDays(days: TournamentDayDto[] | undefined) {
  if (!days) return undefined;
  for (const day of days) {
    if (day.end <= day.start)
      throw new BadRequestException(
        'Cada día tiene que terminar después de empezar.',
      );
  }
  const sorted = [...days]
    .map(({ date, start, end }) => ({ date, start, end }))
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    );
  return {
    days: sorted,
    startDate: sorted[0]?.date ?? null,
    endDate: sorted[sorted.length - 1]?.date ?? null,
  };
}

/** Inscripción abierta: publicado, antes de la fecha límite y del inicio, con cupo. */
export function registrationState(
  tournament: Pick<
    TournamentRow,
    'status' | 'registrationDeadline' | 'startDate' | 'maxEntries'
  >,
  activeEntries: number,
  today: string,
) {
  const spotsLeft =
    tournament.maxEntries === null
      ? null
      : Math.max(0, tournament.maxEntries - activeEntries);
  const beforeDeadline =
    !tournament.registrationDeadline ||
    today <= tournament.registrationDeadline;
  const beforeStart = !tournament.startDate || today <= tournament.startDate;
  const open =
    tournament.status === 'PUBLISHED' &&
    beforeDeadline &&
    beforeStart &&
    spotsLeft !== 0;
  return { open, spotsLeft };
}

function money(value: Prisma.Decimal | null) {
  return value === null ? null : Number(value);
}

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformService,
  ) {}

  // ----- Consola del club -----

  async list(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    const rows = await this.prisma.clubTournament.findMany({
      where: { companyId, clubId },
      select: TOURNAMENT_SELECT,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    const counts = await this.entryCounts(rows.map((row) => row.id));
    return rows.map((row) => ({
      ...row,
      registrationFee: money(row.registrationFee),
      entries: counts.get(row.id) ?? { PENDING: 0, ACCEPTED: 0 },
    }));
  }

  async create(companyId: string, clubId: string, dto: CreateTournamentDto) {
    await this.requireClub(companyId, clubId);
    const data = this.toData(dto);
    const row = await this.prisma.clubTournament.create({
      data: {
        ...data,
        companyId,
        clubId,
        name: dto.name,
        sport: dto.sport,
      },
      select: TOURNAMENT_SELECT,
    });
    return { ...row, registrationFee: money(row.registrationFee) };
  }

  async update(
    companyId: string,
    clubId: string,
    id: string,
    dto: UpdateTournamentDto,
  ) {
    const current = await this.requireTournament(companyId, clubId, id);
    const data = this.toData(dto, current.sport);
    const row = await this.prisma.clubTournament.update({
      where: { id },
      data,
      select: TOURNAMENT_SELECT,
    });
    if (row.status === 'PUBLISHED') this.assertPublishable(row);
    return { ...row, registrationFee: money(row.registrationFee) };
  }

  async setStatus(
    companyId: string,
    clubId: string,
    id: string,
    status: TournamentStatus,
  ) {
    const current = await this.requireTournament(companyId, clubId, id);
    if (status === 'PUBLISHED') this.assertPublishable(current);
    await this.prisma.clubTournament.update({
      where: { id },
      data: {
        status,
        ...(status === 'PUBLISHED' && !current.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
    });
    if (status === 'PUBLISHED') {
      // Fluxion cobra la publicación una sola vez por torneo (aunque se reabra).
      await this.platform.chargeTournamentPublished({
        companyId,
        clubId,
        tournamentId: id,
        tournamentName: current.name,
      });
    }
    return { ok: true, status };
  }

  async remove(companyId: string, clubId: string, id: string) {
    await this.requireTournament(companyId, clubId, id);
    await this.prisma.clubTournament.delete({ where: { id } });
    return { ok: true };
  }

  async listEntries(companyId: string, clubId: string, tournamentId: string) {
    await this.requireTournament(companyId, clubId, tournamentId);
    return this.prisma.tournamentEntry.findMany({
      where: { tournamentId, companyId, clubId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        teamName: true,
        message: true,
        reviewNote: true,
        createdAt: true,
        user: { select: { name: true, email: true, phone: true } },
      },
    });
  }

  async reviewEntry(
    companyId: string,
    clubId: string,
    tournamentId: string,
    entryId: string,
    dto: ReviewEntryDto,
  ) {
    const tournament = await this.requireTournament(
      companyId,
      clubId,
      tournamentId,
    );
    const entry = await this.prisma.tournamentEntry.findFirst({
      where: { id: entryId, tournamentId, companyId, clubId },
      select: {
        id: true,
        status: true,
        teamName: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!entry) throw new NotFoundException('Inscripción no encontrada');
    if (entry.status === 'CANCELLED')
      throw new ConflictException('El jugador canceló esta inscripción.');

    if (
      dto.status === 'ACCEPTED' &&
      entry.status !== 'ACCEPTED' &&
      tournament.maxEntries !== null
    ) {
      const accepted = await this.prisma.tournamentEntry.count({
        where: { tournamentId, status: 'ACCEPTED' },
      });
      if (accepted >= tournament.maxEntries)
        throw new ConflictException(
          `El cupo de ${tournament.maxEntries} ya está completo.`,
        );
    }
    await this.prisma.tournamentEntry.update({
      where: { id: entryId },
      data: { status: dto.status, reviewNote: dto.note || null },
    });
    if (dto.status === 'ACCEPTED' && entry.status !== 'ACCEPTED') {
      await this.platform.chargeEntryAccepted({
        companyId,
        clubId,
        tournamentId,
        tournamentName: tournament.name,
        entryId,
        entryName: entry.teamName || entry.user.name || entry.user.email,
      });
    } else if (dto.status !== 'ACCEPTED' && entry.status === 'ACCEPTED') {
      await this.platform.voidEntryCharge(entryId);
    }
    return { ok: true };
  }

  // ----- App (usuarios con cuenta) -----

  /** Torneos publicados que todavía no terminaron, separados por deporte en el front. */
  async listPublic(query: ListPublicTournamentsDto) {
    const yesterday = addDays(todayIn('UTC'), -1);
    const rows = await this.prisma.clubTournament.findMany({
      where: {
        status: { in: VISIBLE },
        endDate: { gte: yesterday },
        ...(query.sport && { sport: query.sport }),
        ...(query.clubId && { clubId: query.clubId }),
      },
      select: {
        ...TOURNAMENT_SELECT,
        club: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            city: true,
            isPublic: true,
            timezone: true,
          },
        },
      },
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    const counts = await this.entryCounts(rows.map((row) => row.id));
    return rows
      .filter(
        (row) =>
          (row.endDate ?? '') >= todayIn(row.club.timezone || DEFAULT_TZ),
      )
      .map((row) => this.toPublic(row, counts.get(row.id)));
  }

  async getPublic(id: string) {
    const row = await this.prisma.clubTournament.findFirst({
      where: { id, status: { in: [...VISIBLE, 'FINISHED'] } },
      select: {
        ...TOURNAMENT_SELECT,
        club: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            city: true,
            isPublic: true,
            timezone: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Torneo no encontrado');
    const counts = await this.entryCounts([row.id]);
    return this.toPublic(row, counts.get(row.id));
  }

  async listMyEntries(firebaseUid: string) {
    const user = await this.requireUser(firebaseUid);
    return this.prisma.tournamentEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        teamName: true,
        reviewNote: true,
        createdAt: true,
        tournamentId: true,
        tournament: {
          select: {
            name: true,
            sport: true,
            startDate: true,
            club: { select: { name: true } },
          },
        },
      },
    });
  }

  async createEntry(firebaseUid: string, dto: CreateEntryDto) {
    const user = await this.requireUser(firebaseUid);
    if (!user.name?.trim() || !user.phone?.trim())
      throw new BadRequestException(
        'Completá tu nombre y celular en tu perfil para inscribirte.',
      );

    const tournament = await this.prisma.clubTournament.findFirst({
      where: { id: dto.tournamentId, status: { in: VISIBLE } },
      select: {
        id: true,
        companyId: true,
        clubId: true,
        entryType: true,
        status: true,
        registrationDeadline: true,
        startDate: true,
        maxEntries: true,
        club: { select: { timezone: true } },
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    if (tournament.entryType !== 'individual' && !dto.teamName?.trim())
      throw new BadRequestException(
        tournament.entryType === 'pareja'
          ? 'Poné el nombre de la pareja.'
          : 'Poné el nombre del equipo.',
      );

    const active = await this.prisma.tournamentEntry.count({
      where: { tournamentId: tournament.id, status: { in: [...ACTIVE_ENTRY] } },
    });
    const state = registrationState(
      tournament,
      active,
      todayIn(tournament.club.timezone || DEFAULT_TZ),
    );
    if (!state.open)
      throw new ConflictException(
        state.spotsLeft === 0
          ? 'No quedan lugares en este torneo.'
          : 'Las inscripciones de este torneo están cerradas.',
      );

    try {
      return await this.prisma.tournamentEntry.create({
        data: {
          companyId: tournament.companyId,
          clubId: tournament.clubId,
          tournamentId: tournament.id,
          userId: user.id,
          teamName: dto.teamName || null,
          message: dto.message || null,
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Ya estás inscripto en este torneo.');
      throw error;
    }
  }

  async cancelMyEntry(firebaseUid: string, entryId: string) {
    const user = await this.requireUser(firebaseUid);
    const result = await this.prisma.tournamentEntry.updateMany({
      where: {
        id: entryId,
        userId: user.id,
        status: { in: [...ACTIVE_ENTRY] },
      },
      data: { status: 'CANCELLED' },
    });
    if (result.count === 0)
      throw new NotFoundException(
        'No hay una inscripción activa para cancelar.',
      );
    // Si ya estaba confirmada y el cargo no se pagó, se anula.
    await this.platform.voidEntryCharge(entryId);
    return { ok: true };
  }

  // ----- helpers -----

  private toPublic(
    row: TournamentRow & {
      club: {
        id: string;
        name: string;
        logoUrl: string | null;
        city: string | null;
        isPublic: boolean;
        timezone: string;
      };
    },
    counts?: { PENDING: number; ACCEPTED: number },
  ) {
    // Fuera del público: fechas internas de edición.
    const { club, ...rest } = row;
    delete (rest as Partial<typeof rest>).publishedAt;
    delete (rest as Partial<typeof rest>).updatedAt;
    const active = (counts?.PENDING ?? 0) + (counts?.ACCEPTED ?? 0);
    const state = registrationState(
      row,
      active,
      todayIn(club.timezone || DEFAULT_TZ),
    );
    return {
      ...rest,
      registrationFee: money(row.registrationFee),
      registrationOpen: state.open,
      spotsLeft: state.spotsLeft,
      acceptedEntries: counts?.ACCEPTED ?? 0,
      club: {
        id: club.id,
        name: club.name,
        logoUrl: club.logoUrl,
        city: club.city,
        // La ficha del club solo se enlaza si el club la publicó.
        hasPublicPage: club.isPublic,
      },
    };
  }

  private async entryCounts(ids: string[]) {
    const map = new Map<string, { PENDING: number; ACCEPTED: number }>();
    if (ids.length === 0) return map;
    const grouped = await this.prisma.tournamentEntry.groupBy({
      by: ['tournamentId', 'status'],
      where: { tournamentId: { in: ids }, status: { in: [...ACTIVE_ENTRY] } },
      _count: { _all: true },
    });
    for (const group of grouped) {
      const current = map.get(group.tournamentId) ?? {
        PENDING: 0,
        ACCEPTED: 0,
      };
      current[group.status as 'PENDING' | 'ACCEPTED'] = group._count._all;
      map.set(group.tournamentId, current);
    }
    return map;
  }

  private assertPublishable(
    tournament: Pick<TournamentRow, 'days' | 'venues' | 'endDate'>,
  ) {
    const days = Array.isArray(tournament.days) ? tournament.days : [];
    const venues = Array.isArray(tournament.venues) ? tournament.venues : [];
    if (days.length === 0)
      throw new BadRequestException(
        'Para publicar cargá al menos un día con horario.',
      );
    if (venues.length === 0)
      throw new BadRequestException('Para publicar cargá al menos una sede.');
    if ((tournament.endDate ?? '') < addDays(todayIn('UTC'), -1))
      throw new BadRequestException(
        'El torneo ya terminó: no se puede publicar.',
      );
  }

  private toData(
    dto: UpdateTournamentDto | CreateTournamentDto,
    currentSport?: string,
  ) {
    const sport = dto.sport ?? currentSport;
    if (dto.variant && sport && facilitySportFamily(dto.variant) !== sport)
      throw new BadRequestException(
        'La modalidad no corresponde al deporte elegido.',
      );
    const days = normalizeDays(dto.days);
    if (
      dto.registrationDeadline &&
      days?.startDate &&
      dto.registrationDeadline > days.startDate
    )
      throw new BadRequestException(
        'La fecha límite de inscripción tiene que ser antes del primer día.',
      );
    const clean = (list?: string[]) =>
      list?.map((item) => item.trim()).filter(Boolean);
    const venues = dto.venues?.map((venue: TournamentVenueDto) => ({
      name: venue.name,
      address: venue.address || null,
    }));
    return {
      name: dto.name,
      sport: dto.sport,
      variant: dto.variant,
      category: dto.category === '' ? null : dto.category,
      entryType: dto.entryType,
      description: dto.description === '' ? null : dto.description,
      ...(days && {
        days: days.days as Prisma.InputJsonValue,
        startDate: days.startDate,
        endDate: days.endDate,
      }),
      venues: venues as Prisma.InputJsonValue | undefined,
      organizers: clean(dto.organizers),
      contactPhone: dto.contactPhone === '' ? null : dto.contactPhone,
      contactEmail: dto.contactEmail === '' ? null : dto.contactEmail,
      registrationFee: dto.registrationFee,
      feeUnit: dto.feeUnit,
      registrationDeadline: dto.registrationDeadline,
      maxEntries: dto.maxEntries,
      prizes: clean(dto.prizes),
      rules: dto.rules === '' ? null : dto.rules,
    };
  }

  private async requireClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
  }

  private async requireTournament(
    companyId: string,
    clubId: string,
    id: string,
  ) {
    const tournament = await this.prisma.clubTournament.findFirst({
      where: { id, companyId, clubId },
      select: TOURNAMENT_SELECT,
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    return tournament;
  }

  private async requireUser(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, name: true, phone: true },
    });
    if (!user) throw new UnauthorizedException('Perfil no registrado');
    return user;
  }
}
