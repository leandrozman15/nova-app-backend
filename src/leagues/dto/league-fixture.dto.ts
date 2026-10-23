import { IsBoolean, IsIn, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GenerateFixtureDto {
  /** 1 = solo ida, 2 = ida y vuelta. */
  @IsInt()
  @Min(1)
  @Max(2)
  rounds!: number;

  /** Fecha y hora de la primera jornada (ISO). */
  @IsDateString()
  startAt!: string;

  /** Días entre jornadas (7 = semanal). */
  @IsInt()
  @Min(1)
  @Max(60)
  intervalDays!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  venue?: string;

  /** Reemplaza los partidos programados (no jugados) del torneo. */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;

  /** Sorteo al azar de grupos y llave; false respeta el orden de los clubes como cabezas de serie. */
  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;
}

export class AdvanceTournamentDto {
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  intervalDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  venue?: string;
}

export class SetTournamentResultDto {
  @IsInt()
  @Min(0)
  homeScore!: number;

  @IsInt()
  @Min(0)
  awayScore!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  homePens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayPens?: number;
}

export class CreateTournamentMatchDto {
  @IsString()
  homeClubId!: string;

  @IsString()
  awayClubId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  round?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  venue?: string;
}

export class SetCategoryResultDto {
  /** played = se jugó; walkover_home = gana el local porque el visitante no presentó equipo; walkover_away = al revés. */
  @IsIn(['played', 'walkover_home', 'walkover_away'])
  outcome!: 'played' | 'walkover_home' | 'walkover_away';

  @IsOptional()
  @IsInt()
  @Min(0)
  homeScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayScore?: number;

  /** Goles a favor del ganador por W.O. (por defecto 3, perdedor 0). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  walkoverScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
