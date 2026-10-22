import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
  replace?: boolean;
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
