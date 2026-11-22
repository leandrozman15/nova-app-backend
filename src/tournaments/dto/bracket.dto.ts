import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class TeamPlayerDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /** Ficha del padrón: si tiene la app, le llegan los avisos. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  playerId?: string | null;
}

export class TeamDto {
  /** Si no viene, se arma con los nombres: "Pérez / Gómez". */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TeamPlayerDto)
  players!: TeamPlayerDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(64)
  seed?: number | null;
}

export class GenerateBracketDto {
  /** Sortear el orden de los que no tienen siembra. */
  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;

  /** Rehacer aunque ya haya resultados cargados. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class MatchUpdateDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida' })
  date?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60 - 1)
  startMinute?: number | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  court?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  score?: string | null;

  /** Armado a mano de la primera ronda (antes de cargar el resultado). */
  @IsOptional()
  @IsString()
  teamAId?: string | null;

  @IsOptional()
  @IsString()
  teamBId?: string | null;

  /** Equipo ganador (o null para borrar el resultado). */
  @IsOptional()
  @IsString()
  winnerId?: string | null;

  /** Avisar ya a los jugadores de este partido. */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
