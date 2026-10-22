import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentMatchDto, GenerateFixtureDto } from './dto/league-fixture.dto';

type Pairing = { round: number; home: string; away: string };

/** Método del círculo: todos contra todos; con cantidad impar un equipo descansa cada jornada. */
export function roundRobin(teamIds: string[], rounds: 1 | 2): Pairing[] {
  const slots: (string | null)[] = [...teamIds];
  if (slots.length % 2 === 1) slots.push(null);
  const n = slots.length;
  const days = n - 1;
  const out: Pairing[] = [];

  for (let day = 0; day < days; day++) {
    for (let i = 0; i < n / 2; i++) {
      const a = slots[i];
      const b = slots[n - 1 - i];
      if (a && b) {
        // Alterna la localía para equilibrar; el primer puesto fijo cambia cada jornada.
        const flip = (day + i) % 2 === 1;
        out.push({ round: day + 1, home: flip ? b : a, away: flip ? a : b });
      }
    }
    slots.splice(1, 0, slots.pop() as string | null);
  }

  if (rounds === 2) {
    const first = [...out];
    for (const m of first) out.push({ round: m.round + days, home: m.away, away: m.home });
  }
  return out;
}

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

    const teams = await this.teamsByClub(companyId, leagueId, t.clubs.map((c) => c.club));
    const ids = t.clubs.map((c) => teams.get(c.clubId) as string);
    const pairings = roundRobin(ids, dto.rounds as 1 | 2);
    const start = new Date(dto.startAt).getTime();

    await this.prisma.$transaction([
      this.prisma.match.deleteMany({ where: { companyId, tournamentId } }),
      this.prisma.match.createMany({
        data: pairings.map((m) => ({
          companyId,
          leagueId,
          tournamentId,
          round: m.round,
          homeTeamId: m.home,
          awayTeamId: m.away,
          scheduledAt: new Date(start + (m.round - 1) * dto.intervalDays * 86400000),
          venue: dto.venue,
        })),
      }),
    ]);

    return { created: pairings.length, rounds: Math.max(...pairings.map((p) => p.round)) };
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
    const matches = await this.prisma.match.findMany({
      where: { companyId, tournamentId, status: MatchStatus.played },
      include: this.matchInclude,
    });
    const teams = await this.prisma.team.findMany({
      where: { companyId, leagueId, clubId: { in: t.clubs.map((c) => c.clubId) } },
      select: { id: true, name: true },
    });

    const table = new Map(
      teams.map((team) => [
        team.id,
        { teamId: team.id, teamName: team.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
      ]),
    );
    for (const m of matches) {
      const home = table.get(m.homeTeamId);
      const away = table.get(m.awayTeamId);
      if (!home || !away) continue;
      home.played++; away.played++;
      home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
      away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;
      if (m.homeScore > m.awayScore) { home.won++; home.points += 3; away.lost++; }
      else if (m.homeScore < m.awayScore) { away.won++; away.points += 3; home.lost++; }
      else { home.drawn++; away.drawn++; home.points++; away.points++; }
    }
    const rows = Array.from(table.values()).map((r) => ({ ...r, goalDifference: r.goalsFor - r.goalsAgainst }));
    rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName));
    return { tournamentId, table: rows };
  }
}
