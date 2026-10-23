import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  AdvanceTournamentDto,
  CreateTournamentMatchDto,
  GenerateFixtureDto,
  SetTournamentResultDto,
} from './dto/league-fixture.dto';
import {
  buildTable,
  firstRoundPairs,
  groupLabel,
  nextPow2,
  planNextRound,
  rankRows,
  roundLabel,
  roundRobin,
  shuffle,
  splitGroups,
  TableRow,
} from './tournament-logic';

export { roundRobin } from './tournament-logic';

const DAY_MS = 86400000;
const KNOCKOUT_STAGES = ['knockout', 'third_place'];

type GroupMatch = {
  groupName: string | null;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
};

@Injectable()
export class LeagueFixtureService {
  constructor(private readonly prisma: PrismaService) {}

  private async tournament(companyId: string, leagueId: string, id: string) {
    const t = await this.prisma.leagueTournament.findFirst({
      where: { id, leagueId, companyId },
      include: { clubs: { include: { club: { select: { id: true, name: true } } } } },
    });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  /** Cada club participa con un equipo propio de la liga (se crea si no existe). */
  private async teamsByClub(companyId: string, leagueId: string, clubs: { id: string; name: string }[]) {
    const map = new Map<string, string>();
    for (const club of clubs) {
      const existing = await this.prisma.team.findFirst({ where: { companyId, clubId: club.id, leagueId } });
      const team =
        existing ??
        (await this.prisma.team.create({ data: { companyId, clubId: club.id, leagueId, name: club.name } }));
      map.set(club.id, team.id);
    }
    return map;
  }

  private readonly matchInclude = {
    homeTeam: { select: { id: true, name: true, clubId: true } },
    awayTeam: { select: { id: true, name: true, clubId: true } },
    suspensions: true,
  } as const;

  async list(companyId: string, leagueId: string, tournamentId: string) {
    await this.tournament(companyId, leagueId, tournamentId);
    return this.prisma.match.findMany({
      where: { companyId, leagueId, tournamentId },
      include: this.matchInclude,
      orderBy: [{ round: 'asc' }, { scheduledAt: 'asc' }],
    });
  }

  async generate(companyId: string, leagueId: string, tournamentId: string, dto: GenerateFixtureDto) {
    const t = await this.tournament(companyId, leagueId, tournamentId);
    if (t.clubs.length < 2) throw new BadRequestException('El torneo necesita al menos 2 clubes');

    const existing = await this.prisma.match.count({ where: { companyId, tournamentId } });
    if (existing > 0 && !dto.replace) {
      throw new BadRequestException('El torneo ya tiene partidos; usá replace para regenerar el fixture');
    }
    const played = await this.prisma.match.count({
      where: { companyId, tournamentId, status: { not: MatchStatus.scheduled } },
    });
    if (played > 0) throw new BadRequestException('Hay partidos jugados o en curso: no se puede regenerar');

    const clubs = t.clubs.map((c) => c.club);
    const teams = await this.teamsByClub(companyId, leagueId, clubs);
    const teamOf = (clubId: string) => teams.get(clubId) as string;
    const start = new Date(dto.startAt).getTime();
    const at = (round: number) => new Date(start + (round - 1) * dto.intervalDays * DAY_MS);
    const base = { companyId, leagueId, tournamentId, venue: dto.venue };
    const ordered = dto.shuffle === false ? clubs : shuffle(clubs);

    const data: Prisma.MatchCreateManyInput[] = [];
    const seeds = new Map<string, number>();

    if (t.formatType === 'knockout') {
      const seedTeams = ordered.map((c) => teamOf(c.id));
      ordered.forEach((c, i) => seeds.set(c.id, i + 1));
      const label = roundLabel(nextPow2(ordered.length));
      for (const pair of firstRoundPairs(seedTeams)) {
        if (!pair.away) continue;
        data.push({
          ...base, round: 1, stage: 'knockout', label, bracketSlot: pair.slot,
          homeTeamId: pair.home, awayTeamId: pair.away, scheduledAt: at(1),
        });
      }
    } else if (t.formatType === 'groups' || t.formatType === 'groups_knockout') {
      const groupCount = t.groupCount ?? 2;
      if (clubs.length < groupCount * 2) {
        throw new BadRequestException(`Para ${groupCount} grupos hacen falta al menos ${groupCount * 2} clubes`);
      }
      splitGroups(ordered, groupCount).forEach((group, g) => {
        for (const m of roundRobin(group.map((c) => teamOf(c.id)), dto.rounds as 1 | 2)) {
          data.push({
            ...base, round: m.round, stage: 'group', groupName: groupLabel(g),
            homeTeamId: m.home, awayTeamId: m.away, scheduledAt: at(m.round),
          });
        }
      });
    } else {
      for (const m of roundRobin(ordered.map((c) => teamOf(c.id)), dto.rounds as 1 | 2)) {
        data.push({ ...base, round: m.round, stage: 'league', homeTeamId: m.home, awayTeamId: m.away, scheduledAt: at(m.round) });
      }
    }

    await this.prisma.$transaction([
      this.prisma.match.deleteMany({ where: { companyId, tournamentId } }),
      this.prisma.leagueTournamentClub.updateMany({ where: { tournamentId }, data: { seed: null } }),
      ...Array.from(seeds, ([clubId, seed]) =>
        this.prisma.leagueTournamentClub.update({ where: { tournamentId_clubId: { tournamentId, clubId } }, data: { seed } }),
      ),
      this.prisma.match.createMany({ data }),
    ]);

    return { created: data.length, rounds: Math.max(...data.map((m) => m.round ?? 1)) };
  }

  /** Cierra la ronda actual y arma la siguiente; en "grupos + eliminación" también arma el cruce inicial. */
  async advance(companyId: string, leagueId: string, tournamentId: string, dto: AdvanceTournamentDto) {
    const t = await this.tournament(companyId, leagueId, tournamentId);
    if (t.formatType !== 'knockout' && t.formatType !== 'groups_knockout') {
      throw new BadRequestException('Este formato no tiene fases eliminatorias');
    }
    const interval = dto.intervalDays ?? 7;

    const knockout = await this.prisma.match.findMany({
      where: { companyId, tournamentId, stage: 'knockout' },
      orderBy: { round: 'asc' },
    });

    if (knockout.length === 0) {
      if (t.formatType === 'knockout') throw new BadRequestException('Generá el fixture primero');
      return this.startKnockoutFromGroups(t, dto, interval);
    }

    const seededClubs = t.clubs.filter((c) => c.seed != null).sort((a, b) => (a.seed as number) - (b.seed as number));
    const teams = await this.teamsByClub(companyId, leagueId, seededClubs.map((c) => c.club));
    const seeds = seededClubs.map((c) => teams.get(c.clubId) as string);

    const round = Math.max(...knockout.map((m) => m.round ?? 1));
    const current = knockout.filter((m) => (m.round ?? 1) === round);
    const plan = planNextRound(
      seeds,
      round,
      current.map((m) => ({
        slot: m.bracketSlot ?? 0,
        home: m.homeTeamId,
        away: m.awayTeamId,
        played: m.status === MatchStatus.played,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homePens: m.homePens,
        awayPens: m.awayPens,
      })),
    );

    if (plan.finished) {
      await this.prisma.leagueTournament.update({ where: { id: tournamentId }, data: { status: 'finished' } });
      const champion = await this.prisma.team.findUnique({ where: { id: plan.champion }, select: { name: true } });
      return { finished: true, champion: champion?.name ?? null };
    }

    const lastDate = Math.max(...current.map((m) => m.scheduledAt.getTime()));
    const when = dto.startAt ? new Date(dto.startAt) : new Date(lastDate + interval * DAY_MS);
    const base = { companyId, leagueId, tournamentId, venue: dto.venue, round: round + 1, scheduledAt: when };
    const data: Prisma.MatchCreateManyInput[] = plan.pairs.map((p) => ({
      ...base, stage: 'knockout', label: plan.label, bracketSlot: p.slot, homeTeamId: p.home, awayTeamId: p.away,
    }));
    if (plan.thirdPlace && t.thirdPlace) {
      data.push({ ...base, stage: 'third_place', label: 'Tercer puesto', homeTeamId: plan.thirdPlace.home, awayTeamId: plan.thirdPlace.away });
    }
    await this.prisma.match.createMany({ data });
    return { finished: false, created: data.length, label: plan.label };
  }

  private async startKnockoutFromGroups(
    t: Awaited<ReturnType<LeagueFixtureService['tournament']>>,
    dto: AdvanceTournamentDto,
    interval: number,
  ) {
    const groupMatches = await this.prisma.match.findMany({
      where: { companyId: t.companyId, tournamentId: t.id, stage: 'group' },
      include: this.matchInclude,
    });
    if (groupMatches.length === 0) throw new BadRequestException('Generá el fixture primero');
    if (groupMatches.some((m) => m.status !== MatchStatus.played)) {
      throw new BadRequestException('Faltan resultados de la fase de grupos');
    }

    const groups = this.groupTables(groupMatches);
    const perGroup = t.advancePerGroup ?? 2;
    const clubOfTeam = new Map<string, string>();
    groupMatches.forEach((m) => {
      clubOfTeam.set(m.homeTeam.id, m.homeTeam.clubId);
      clubOfTeam.set(m.awayTeam.id, m.awayTeam.clubId);
    });

    // Semillas: primeros de grupo (por rendimiento), luego segundos, etc.
    const seedTeams: string[] = [];
    for (let rank = 0; rank < perGroup; rank++) {
      const tier = groups.map((g) => g.table[rank]).filter(Boolean) as TableRow[];
      seedTeams.push(...rankRows(tier).map((r) => r.teamId));
    }
    if (seedTeams.length < 2) throw new BadRequestException('No hay suficientes clasificados');

    const lastDate = Math.max(...groupMatches.map((m) => m.scheduledAt.getTime()));
    const when = dto.startAt ? new Date(dto.startAt) : new Date(lastDate + interval * DAY_MS);
    const label = roundLabel(nextPow2(seedTeams.length));
    const data: Prisma.MatchCreateManyInput[] = firstRoundPairs(seedTeams)
      .filter((p) => p.away)
      .map((p) => ({
        companyId: t.companyId, leagueId: t.leagueId, tournamentId: t.id, venue: dto.venue, round: 1,
        scheduledAt: when, stage: 'knockout', label, bracketSlot: p.slot, homeTeamId: p.home, awayTeamId: p.away as string,
      }));

    await this.prisma.$transaction([
      this.prisma.leagueTournamentClub.updateMany({ where: { tournamentId: t.id }, data: { seed: null } }),
      ...seedTeams.map((teamId, i) =>
        this.prisma.leagueTournamentClub.update({
          where: { tournamentId_clubId: { tournamentId: t.id, clubId: clubOfTeam.get(teamId) as string } },
          data: { seed: i + 1 },
        }),
      ),
      this.prisma.match.createMany({ data }),
    ]);
    return { finished: false, created: data.length, label };
  }

  private groupTables(matches: GroupMatch[]) {
    const byGroup = new Map<string, GroupMatch[]>();
    matches.forEach((m) => byGroup.set(m.groupName ?? '', [...(byGroup.get(m.groupName ?? '') ?? []), m]));
    return Array.from(byGroup, ([name, list]) => {
      const teams = new Map<string, { id: string; name: string }>();
      list.forEach((m) => { teams.set(m.homeTeam.id, m.homeTeam); teams.set(m.awayTeam.id, m.awayTeam); });
      return {
        name,
        table: buildTable(Array.from(teams.values()), list.filter((m) => m.status === MatchStatus.played)),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  async setResult(companyId: string, leagueId: string, tournamentId: string, matchId: string, dto: SetTournamentResultDto) {
    const match = await this.prisma.match.findFirst({ where: { id: matchId, companyId, leagueId, tournamentId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status === MatchStatus.suspended) {
      throw new BadRequestException('El partido está suspendido: reprogramalo antes de cargar el resultado');
    }

    const knockout = match.stage != null && KNOCKOUT_STAGES.includes(match.stage);
    const tied = dto.homeScore === dto.awayScore;
    if (knockout && tied && (dto.homePens == null || dto.awayPens == null || dto.homePens === dto.awayPens)) {
      throw new BadRequestException('En eliminación directa un empate se define por penales');
    }

    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        homePens: knockout && tied ? dto.homePens : null,
        awayPens: knockout && tied ? dto.awayPens : null,
        status: MatchStatus.played,
      },
      include: this.matchInclude,
    });
  }

  async createMatch(companyId: string, leagueId: string, tournamentId: string, dto: CreateTournamentMatchDto) {
    const t = await this.tournament(companyId, leagueId, tournamentId);
    if (dto.homeClubId === dto.awayClubId) throw new BadRequestException('Los equipos deben ser distintos');
    const inTournament = new Set(t.clubs.map((c) => c.clubId));
    if (!inTournament.has(dto.homeClubId) || !inTournament.has(dto.awayClubId)) {
      throw new BadRequestException('Ambos clubes deben participar del torneo');
    }
    const teams = await this.teamsByClub(
      companyId,
      leagueId,
      t.clubs.map((c) => c.club).filter((c) => c.id === dto.homeClubId || c.id === dto.awayClubId),
    );
    return this.prisma.match.create({
      data: {
        companyId,
        leagueId,
        tournamentId,
        round: dto.round,
        stage: t.formatType === 'league' ? 'league' : null,
        homeTeamId: teams.get(dto.homeClubId) as string,
        awayTeamId: teams.get(dto.awayClubId) as string,
        scheduledAt: new Date(dto.scheduledAt),
        venue: dto.venue,
      },
      include: this.matchInclude,
    });
  }

  async removeMatch(companyId: string, leagueId: string, tournamentId: string, matchId: string) {
    const { count } = await this.prisma.match.deleteMany({ where: { id: matchId, companyId, leagueId, tournamentId } });
    if (!count) throw new NotFoundException('Match not found');
    return { ok: true };
  }

  async standings(companyId: string, leagueId: string, tournamentId: string) {
    const t = await this.tournament(companyId, leagueId, tournamentId);
    const all = await this.prisma.match.findMany({
      where: { companyId, tournamentId },
      include: this.matchInclude,
    });

    const groups = this.groupTables(all.filter((m) => m.stage === 'group'));
    const teams = await this.prisma.team.findMany({
      where: { companyId, leagueId, clubId: { in: t.clubs.map((c) => c.clubId) } },
      select: { id: true, name: true },
    });
    const table = buildTable(
      teams,
      all.filter((m) => (m.stage === 'league' || m.stage === null) && m.status === MatchStatus.played),
    );

    return { tournamentId, formatType: t.formatType, table: t.formatType === 'league' ? table : [], groups };
  }
}
