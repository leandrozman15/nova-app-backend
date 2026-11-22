import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { addDays, todayIn } from '../bookings/booking-time';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import {
  buildBracket,
  nextSlot,
  roundName,
  scheduleKey,
  scheduleText,
  teamLabel,
} from './bracket-rules';
import {
  GenerateBracketDto,
  MatchUpdateDto,
  TeamDto,
} from './dto/bracket.dto';

type TeamPlayer = { name: string; playerId?: string | null };
type TeamRow = {
  id: string;
  name: string;
  players: Prisma.JsonValue;
  notifyUids: string[];
  seed: number | null;
  entryId: string | null;
};
type MatchRow = {
  id: string;
  round: number;
  position: number;
  teamAId: string | null;
  teamBId: string | null;
  date: string | null;
  startMinute: number | null;
  court: string | null;
  score: string | null;
  winnerId: string | null;
  notifiedKey: string | null;
  notifiedAt: Date | null;
};

const TEAM_SELECT = {
  id: true,
  name: true,
  players: true,
  notifyUids: true,
  seed: true,
  entryId: true,
} as const;

const MATCH_SELECT = {
  id: true,
  round: true,
  position: true,
  teamAId: true,
  teamBId: true,
  date: true,
  startMinute: true,
  court: true,
  score: true,
  winnerId: true,
  notifiedKey: true,
  notifiedAt: true,
} as const;

/** Dónde ve el jugador sus partidos en la app. */
export const MY_MATCHES_URL = '/explorar/mis-partidos';

/** Lo que hay que avisar: programación y rivales. Si cambia algo, se vuelve a avisar. */
export function notifyKeyOf(m: {
  date: string | null;
  startMinute: number | null;
  court: string | null;
  teamAId: string | null;
  teamBId: string | null;
}) {
  const key = scheduleKey(m);
  if (!key || !m.teamAId || !m.teamBId) return null;
  return `${key}|${m.teamAId}|${m.teamBId}`;
}

function playersOf(value: Prisma.JsonValue): TeamPlayer[] {
  return Array.isArray(value)
    ? (value as TeamPlayer[]).filter((p) => p && typeof p.name === 'string')
    : [];
}

/** Cuadro de eliminación del torneo: parejas cargadas a mano, partidos y avisos. */
@Injectable()
export class TournamentBracketService {
  private readonly logger = new Logger(TournamentBracketService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly push?: PushService,
  ) {}

  // ─── Consola ──────────────────────────────────────────────────────────────

  async view(companyId: string, clubId: string, tournamentId: string) {
    const tournament = await this.tournament(companyId, clubId, tournamentId);
    const [teams, matches] = await Promise.all([
      this.teams(tournamentId),
      this.matches(tournamentId),
    ]);
    return this.present(tournament, teams, matches, true);
  }

  async addTeam(
    companyId: string,
    clubId: string,
    tournamentId: string,
    dto: TeamDto,
  ) {
    await this.tournament(companyId, clubId, tournamentId);
    const players = this.cleanPlayers(dto.players);
    const name = dto.name?.trim() || teamLabel(players);
    if (!name) throw new BadRequestException('Poné al menos un nombre.');
    await this.prisma.tournamentTeam.create({
      data: {
        companyId,
        clubId,
        tournamentId,
        name,
        players: players as Prisma.InputJsonValue,
        notifyUids: await this.uidsOf(clubId, players),
        seed: dto.seed ?? null,
      },
    });
    return this.view(companyId, clubId, tournamentId);
  }

  async updateTeam(
    companyId: string,
    clubId: string,
    tournamentId: string,
    teamId: string,
    dto: TeamDto,
  ) {
    await this.tournament(companyId, clubId, tournamentId);
    const team = await this.team(tournamentId, teamId);
    const players = this.cleanPlayers(dto.players);
    const name = dto.name?.trim() || teamLabel(players);
    if (!name) throw new BadRequestException('Poné al menos un nombre.');
    const fromEntry = team.entryId
      ? await this.entryUid(team.entryId)
      : null;
    const uids = await this.uidsOf(clubId, players);
    await this.prisma.tournamentTeam.update({
      where: { id: teamId },
      data: {
        name,
        players: players as Prisma.InputJsonValue,
        notifyUids: [...new Set([...uids, ...(fromEntry ? [fromEntry] : [])])],
        ...(dto.seed === undefined ? {} : { seed: dto.seed }),
      },
    });
    return this.view(companyId, clubId, tournamentId);
  }

  async removeTeam(
    companyId: string,
    clubId: string,
    tournamentId: string,
    teamId: string,
  ) {
    await this.tournament(companyId, clubId, tournamentId);
    await this.team(tournamentId, teamId);
    const used = await this.prisma.tournamentMatch.count({
      where: {
        tournamentId,
        OR: [{ teamAId: teamId }, { teamBId: teamId }],
      },
    });
    if (used)
      throw new ConflictException(
        'Esta pareja ya está en el cuadro. Rehacé el cuadro o sacala del partido primero.',
      );
    await this.prisma.tournamentTeam.delete({ where: { id: teamId } });
    return this.view(companyId, clubId, tournamentId);
  }

  /** Suma al cuadro a los inscriptos aceptados desde la app (sin repetir). */
  async importEntries(companyId: string, clubId: string, tournamentId: string) {
    await this.tournament(companyId, clubId, tournamentId);
    const [entries, existing] = await Promise.all([
      this.prisma.tournamentEntry.findMany({
        where: { tournamentId, status: 'ACCEPTED' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          teamName: true,
          user: { select: { name: true, email: true, firebaseUid: true } },
        },
      }),
      this.prisma.tournamentTeam.findMany({
        where: { tournamentId, entryId: { not: null } },
        select: { entryId: true },
      }),
    ]);
    const taken = new Set(existing.map((t) => t.entryId));
    const fresh = entries.filter((e) => !taken.has(e.id));
    for (const e of fresh) {
      const person = e.user.name || e.user.email || 'Inscripto';
      await this.prisma.tournamentTeam.create({
        data: {
          companyId,
          clubId,
          tournamentId,
          name: e.teamName?.trim() || person,
          players: [{ name: person }] as Prisma.InputJsonValue,
          notifyUids: [e.user.firebaseUid],
          entryId: e.id,
        },
      });
    }
    return {
      imported: fresh.length,
      ...(await this.view(companyId, clubId, tournamentId)),
    };
  }

  /** Arma (o rehace) el cuadro con las parejas cargadas. */
  async generate(
    companyId: string,
    clubId: string,
    tournamentId: string,
    dto: GenerateBracketDto,
  ) {
    await this.tournament(companyId, clubId, tournamentId);
    const teams = await this.teams(tournamentId);
    if (teams.length < 2)
      throw new BadRequestException('Cargá al menos 2 parejas para armar el cuadro.');
    if (teams.length > 128)
      throw new BadRequestException('El cuadro admite hasta 128 parejas.');
    const played = await this.prisma.tournamentMatch.count({
      where: { tournamentId, winnerId: { not: null }, teamAId: { not: null }, teamBId: { not: null } },
    });
    if (played && !dto.force)
      throw new ConflictException(
        'Ya hay resultados cargados. Si rehacés el cuadro se pierden.',
      );

    const seeded = teams
      .filter((t) => t.seed !== null)
      .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    const rest = teams.filter((t) => t.seed === null);
    if (dto.shuffle)
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
    const slots = buildBracket([...seeded, ...rest].map((t) => t.id));
    await this.prisma.$transaction([
      this.prisma.tournamentMatch.deleteMany({ where: { tournamentId } }),
      this.prisma.tournamentMatch.createMany({
        data: slots.map((s) => ({ ...s, companyId, clubId, tournamentId })),
      }),
    ]);
    return this.view(companyId, clubId, tournamentId);
  }

  async updateMatch(
    companyId: string,
    clubId: string,
    tournamentId: string,
    matchId: string,
    dto: MatchUpdateDto,
  ) {
    const tournament = await this.tournament(companyId, clubId, tournamentId);
    const all = await this.matches(tournamentId);
    const match = all.find((m) => m.id === matchId);
    if (!match) throw new NotFoundException('Partido no encontrado');
    const data: Prisma.TournamentMatchUpdateInput = {};

    if (dto.date !== undefined) data.date = dto.date || null;
    if (dto.startMinute !== undefined) data.startMinute = dto.startMinute;
    if (dto.court !== undefined) data.court = dto.court || null;
    if (dto.score !== undefined) data.score = dto.score || null;

    let teamA = match.teamAId;
    let teamB = match.teamBId;
    if (dto.teamAId !== undefined || dto.teamBId !== undefined) {
      if (match.round !== 1)
        throw new BadRequestException('Solo se acomodan a mano los partidos de la primera ronda.');
      if (match.winnerId && match.teamAId && match.teamBId)
        throw new ConflictException('Este partido ya tiene resultado.');
      const teamIds = new Set((await this.teams(tournamentId)).map((t) => t.id));
      for (const id of [dto.teamAId, dto.teamBId])
        if (id && !teamIds.has(id)) throw new BadRequestException('Pareja inválida');
      if (dto.teamAId !== undefined) teamA = dto.teamAId || null;
      if (dto.teamBId !== undefined) teamB = dto.teamBId || null;
      if (teamA && teamA === teamB)
        throw new BadRequestException('Elegí dos parejas distintas.');
      // Una pareja está una sola vez en la primera ronda.
      const elsewhere = all.filter(
        (m) =>
          m.round === 1 &&
          m.id !== match.id &&
          [m.teamAId, m.teamBId].some((t) => t && (t === teamA || t === teamB)),
      );
      if (elsewhere.length)
        throw new ConflictException('Esa pareja ya juega otro partido de la primera ronda.');
      data.teamAId = teamA;
      data.teamBId = teamB;
    }

    let winner = match.winnerId;
    const byeWinner = teamA && !teamB ? teamA : !teamA && teamB ? teamB : null;
    if (dto.winnerId !== undefined) {
      winner = dto.winnerId || null;
      if (winner && winner !== teamA && winner !== teamB)
        throw new BadRequestException('El ganador tiene que ser una de las dos parejas.');
      if (winner && (!teamA || !teamB) && winner !== byeWinner)
        throw new BadRequestException('Faltan las dos parejas para cargar el resultado.');
    } else if (data.teamAId !== undefined || data.teamBId !== undefined) {
      // Al acomodar a mano: el que queda solo pasa directo.
      winner = byeWinner;
    }
    if (winner !== match.winnerId) {
      const next = nextSlot(match.round, match.position);
      const target = all.find(
        (m) => m.round === next.round && m.position === next.position,
      );
      if (target) {
        if (target.winnerId)
          throw new ConflictException(
            'El partido siguiente ya tiene resultado. Borralo primero.',
          );
        await this.prisma.tournamentMatch.update({
          where: { id: target.id },
          data: next.side === 'A' ? { teamAId: winner } : { teamBId: winner },
        });
      }
      data.winnerId = winner;
      if (!winner) data.score = dto.score === undefined ? null : data.score;
    }

    const updated = await this.prisma.tournamentMatch.update({
      where: { id: matchId },
      data,
      select: MATCH_SELECT,
    });
    let notified: { players: number } | null = null;
    if (dto.notify) notified = await this.notifyMatches(tournament, [updated]);
    return {
      notified,
      ...(await this.view(companyId, clubId, tournamentId)),
    };
  }

  /** Avisa todos los partidos con día, hora y rivales que todavía no se avisaron (o cambiaron). */
  async notifyPending(companyId: string, clubId: string, tournamentId: string) {
    const tournament = await this.tournament(companyId, clubId, tournamentId);
    const pending = (await this.matches(tournamentId)).filter(
      (m) => !m.winnerId && notifyKeyOf(m) && notifyKeyOf(m) !== m.notifiedKey,
    );
    const result = await this.notifyMatches(tournament, pending);
    return {
      matches: pending.length,
      ...result,
      ...(await this.view(companyId, clubId, tournamentId)),
    };
  }

  // ─── App ──────────────────────────────────────────────────────────────────

  /** Partidos de torneo del usuario: próximos y últimos resultados. */
  async myMatches(firebaseUid: string) {
    const teams = await this.prisma.tournamentTeam.findMany({
      where: { notifyUids: { has: firebaseUid } },
      select: { id: true, name: true, tournamentId: true },
      take: 200,
    });
    if (!teams.length) return { upcoming: [], recent: [] };
    const mine = new Set(teams.map((t) => t.id));
    const matches = await this.prisma.tournamentMatch.findMany({
      where: {
        OR: [{ teamAId: { in: [...mine] } }, { teamBId: { in: [...mine] } }],
      },
      select: { ...MATCH_SELECT, tournamentId: true },
    });
    const tournamentIds = [...new Set(matches.map((m) => m.tournamentId))];
    const [tournaments, rivals, rounds] = await Promise.all([
      this.prisma.clubTournament.findMany({
        where: { id: { in: tournamentIds } },
        select: {
          id: true,
          name: true,
          sport: true,
          category: true,
          club: { select: { name: true, logoUrl: true, timezone: true } },
        },
      }),
      this.prisma.tournamentTeam.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                matches
                  .flatMap((m) => [m.teamAId, m.teamBId])
                  .filter((x): x is string => Boolean(x)),
              ),
            ],
          },
        },
        select: { id: true, name: true },
      }),
      this.prisma.tournamentMatch.groupBy({
        by: ['tournamentId'],
        where: { tournamentId: { in: tournamentIds } },
        _max: { round: true },
      }),
    ]);
    const tById = new Map(tournaments.map((t) => [t.id, t]));
    const nameOf = new Map(rivals.map((t) => [t.id, t.name]));
    const maxRound = new Map(rounds.map((r) => [r.tournamentId, r._max.round ?? 1]));
    const today = todayIn('America/Argentina/Buenos_Aires');
    const items = matches
      .filter((m) => m.teamAId && m.teamBId)
      .map((m) => {
        const t = tById.get(m.tournamentId);
        const meA = m.teamAId ? mine.has(m.teamAId) : false;
        const myTeam = meA ? m.teamAId! : m.teamBId!;
        const rival = meA ? m.teamBId : m.teamAId;
        return {
          id: m.id,
          tournamentId: m.tournamentId,
          tournamentName: t?.name ?? 'Torneo',
          category: t?.category ?? null,
          sport: t?.sport ?? null,
          clubName: t?.club.name ?? null,
          clubLogoUrl: t?.club.logoUrl ?? null,
          roundName: roundName(m.round, maxRound.get(m.tournamentId) ?? 1),
          myTeam: nameOf.get(myTeam) ?? '',
          rival: rival ? (nameOf.get(rival) ?? '') : null,
          date: m.date,
          startMinute: m.startMinute,
          court: m.court,
          score: m.score,
          result: m.winnerId ? (m.winnerId === myTeam ? 'WON' : 'LOST') : null,
        };
      });
    const upcoming = items
      .filter((i) => !i.result && (!i.date || i.date >= addDays(today, -1)))
      .sort(
        (a, b) =>
          (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
          (a.startMinute ?? 0) - (b.startMinute ?? 0),
      );
    const recent = items
      .filter((i) => i.result)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 10);
    return { upcoming, recent };
  }

  /** Cuadro para la ficha pública del torneo (solo nombres de las parejas). */
  async publicBracket(tournamentId: string) {
    const [teams, matches] = await Promise.all([
      this.teams(tournamentId),
      this.matches(tournamentId),
    ]);
    if (!matches.length) return null;
    const presented = this.present(
      { id: tournamentId, name: '', clubName: null },
      teams,
      matches,
      false,
    );
    return { rounds: presented.rounds };
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  private present(
    tournament: { id: string; name: string; clubName?: string | null },
    teams: TeamRow[],
    matches: MatchRow[],
    full: boolean,
  ) {
    const totalRounds = matches.reduce((max, m) => Math.max(max, m.round), 0);
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1).map(
      (round) => ({
        round,
        name: roundName(round, totalRounds),
        matches: matches
          .filter((m) => m.round === round)
          .sort((a, b) => a.position - b.position)
          .map((m) => {
            const key = notifyKeyOf(m);
            const bye = round === 1 && Boolean(m.winnerId) && (!m.teamAId || !m.teamBId);
            return {
              id: m.id,
              round: m.round,
              position: m.position,
              teamA: m.teamAId ? { id: m.teamAId, name: teamName.get(m.teamAId) ?? '' } : null,
              teamB: m.teamBId ? { id: m.teamBId, name: teamName.get(m.teamBId) ?? '' } : null,
              date: m.date,
              startMinute: m.startMinute,
              court: m.court,
              score: m.score,
              winnerId: m.winnerId,
              bye,
              ...(full
                ? {
                    notifiedAt: m.notifiedAt,
                    needsNotice: Boolean(key) && !m.winnerId && key !== m.notifiedKey,
                  }
                : {}),
            };
          }),
      }),
    );
    if (!full) return { rounds, teams: [], pendingNotices: 0, tournament };
    const inBracket = new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]));
    return {
      tournament,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        players: playersOf(t.players),
        seed: t.seed,
        fromApp: Boolean(t.entryId),
        withApp: t.notifyUids.length,
        inBracket: inBracket.has(t.id),
      })),
      rounds,
      pendingNotices: rounds
        .flatMap((r) => r.matches)
        .filter((m) => 'needsNotice' in m && m.needsNotice).length,
      champion: (() => {
        const final = matches.find((m) => m.round === totalRounds);
        return final?.winnerId ? { id: final.winnerId, name: teamName.get(final.winnerId) ?? '' } : null;
      })(),
    };
  }

  private async notifyMatches(
    tournament: { id: string; name: string },
    matches: MatchRow[],
  ) {
    const ready = matches.filter((m) => notifyKeyOf(m));
    if (!ready.length) return { players: 0, sent: 0 };
    const teamIds = [
      ...new Set(ready.flatMap((m) => [m.teamAId!, m.teamBId!])),
    ];
    const [teams, rounds] = await Promise.all([
      this.prisma.tournamentTeam.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true, notifyUids: true },
      }),
      this.prisma.tournamentMatch.aggregate({
        where: { tournamentId: tournament.id },
        _max: { round: true },
      }),
    ]);
    const byId = new Map(teams.map((t) => [t.id, t]));
    const total = rounds._max.round ?? 1;
    let players = 0;
    let sent = 0;
    for (const m of ready) {
      const when = scheduleText(m);
      const round = roundName(m.round, total);
      for (const [mineId, rivalId] of [
        [m.teamAId!, m.teamBId!],
        [m.teamBId!, m.teamAId!],
      ]) {
        const team = byId.get(mineId);
        if (!team?.notifyUids.length) continue;
        players += team.notifyUids.length;
        if (!this.push) continue;
        try {
          const res = await this.push.notifyUsers(team.notifyUids, {
            title: `${tournament.name}: ${round}`,
            body: `Jugás ${when} vs ${byId.get(rivalId)?.name ?? 'a confirmar'}`,
            url: MY_MATCHES_URL,
            tag: `tmatch-${m.id}`,
          });
          sent += res.sent;
        } catch (error) {
          this.logger.warn(`No se pudo avisar el partido ${m.id}: ${String(error)}`);
        }
      }
      await this.prisma.tournamentMatch.update({
        where: { id: m.id },
        data: { notifiedKey: notifyKeyOf(m), notifiedAt: new Date() },
      });
    }
    return { players, sent };
  }

  private cleanPlayers(players: TeamPlayer[]) {
    return players
      .map((p) => ({
        name: p.name.trim().replace(/\s+/g, ' '),
        ...(p.playerId ? { playerId: p.playerId } : {}),
      }))
      .filter((p) => p.name.length >= 2);
  }

  /** Cuentas con la app de los jugadores vinculados al padrón del club. */
  private async uidsOf(clubId: string, players: TeamPlayer[]) {
    const ids = players.map((p) => p.playerId).filter((x): x is string => Boolean(x));
    if (!ids.length) return [];
    const rows = await this.prisma.player.findMany({
      where: { clubId, id: { in: ids }, authUid: { not: null } },
      select: { authUid: true },
    });
    return [...new Set(rows.map((r) => r.authUid!).filter(Boolean))];
  }

  private async entryUid(entryId: string) {
    const entry = await this.prisma.tournamentEntry.findUnique({
      where: { id: entryId },
      select: { user: { select: { firebaseUid: true } } },
    });
    return entry?.user.firebaseUid ?? null;
  }

  private async tournament(companyId: string, clubId: string, id: string) {
    const row = await this.prisma.clubTournament.findFirst({
      where: { id, companyId, clubId },
      select: {
        id: true,
        name: true,
        entryType: true,
        sport: true,
        category: true,
        status: true,
        club: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('Torneo no encontrado');
    return {
      id: row.id,
      name: row.name,
      entryType: row.entryType,
      sport: row.sport,
      category: row.category,
      status: row.status,
      clubName: row.club.name,
    };
  }

  private async team(tournamentId: string, id: string) {
    const team = await this.prisma.tournamentTeam.findFirst({
      where: { id, tournamentId },
      select: TEAM_SELECT,
    });
    if (!team) throw new NotFoundException('Pareja no encontrada');
    return team;
  }

  private teams(tournamentId: string): Promise<TeamRow[]> {
    return this.prisma.tournamentTeam.findMany({
      where: { tournamentId },
      orderBy: [{ seed: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: TEAM_SELECT,
    });
  }

  private matches(tournamentId: string): Promise<MatchRow[]> {
    return this.prisma.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: 'asc' }, { position: 'asc' }],
      select: MATCH_SELECT,
    });
  }
}
