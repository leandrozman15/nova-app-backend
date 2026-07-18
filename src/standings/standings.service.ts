import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type StandingRow = {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  async byLeague(companyId: string, leagueId: string) {
    const league = await this.prisma.league.findFirst({
      where: { id: leagueId, companyId },
      include: {
        teams: true,
      },
    });

    if (!league) {
      throw new NotFoundException('League not found');
    }

    const matches = await this.prisma.match.findMany({
      where: {
        companyId,
        leagueId,
        status: MatchStatus.played,
      },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });

    const table = new Map<string, StandingRow>();

    for (const team of league.teams) {
      table.set(team.id, {
        teamId: team.id,
        teamName: team.name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }

    for (const match of matches) {
      const home = table.get(match.homeTeamId);
      const away = table.get(match.awayTeamId);
      if (!home || !away) continue;

      home.played += 1;
      away.played += 1;

      home.goalsFor += match.homeScore;
      home.goalsAgainst += match.awayScore;
      away.goalsFor += match.awayScore;
      away.goalsAgainst += match.homeScore;

      if (match.homeScore > match.awayScore) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (match.homeScore < match.awayScore) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    }

    const rows = Array.from(table.values()).map((row) => ({
      ...row,
      goalDifference: row.goalsFor - row.goalsAgainst,
    }));

    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    });

    return {
      leagueId,
      leagueName: league.name,
      season: league.season,
      table: rows,
    };
  }
}
