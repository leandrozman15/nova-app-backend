import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  FACILITY_SPORT_FAMILIES,
  FACILITY_SPORT_IDS,
} from '../../facilities/facility-sports';

export const ENTRY_TYPES = ['individual', 'pareja', 'equipo'] as const;
export const FEE_UNITS = ['equipo', 'pareja', 'persona'] as const;
export const TOURNAMENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'CLOSED',
  'FINISHED',
] as const;

const SPORT_FAMILY_IDS = FACILITY_SPORT_FAMILIES.map((family) => family.id);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class TournamentDayDto {
  @Matches(DATE, { message: 'Fecha inválida (AAAA-MM-DD)' })
  date!: string;

  @Matches(TIME, { message: 'Hora de inicio inválida (HH:MM)' })
  start!: string;

  @Matches(TIME, { message: 'Hora de fin inválida (HH:MM)' })
  end!: string;
}

export class TournamentVenueDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  address?: string;
}

/** Campos editables (alta y edición). */
class TournamentFieldsDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(FACILITY_SPORT_IDS, { message: 'Modalidad no válida' })
  variant?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @IsOptional()
  @IsIn(ENTRY_TYPES)
  entryType?: (typeof ENTRY_TYPES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TournamentDayDto)
  days?: TournamentDayDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TournamentVenueDto)
  venues?: TournamentVenueDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  organizers?: string[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Matches(/^\+?[\d\s()-]{8,25}$/, { message: 'Teléfono de contacto inválido' })
  contactPhone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsEmail({}, { message: 'Email de contacto inválido' })
  @MaxLength(120)
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  registrationFee?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(FEE_UNITS)
  feeUnit?: (typeof FEE_UNITS)[number] | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DATE, { message: 'Fecha límite inválida (AAAA-MM-DD)' })
  registrationDeadline?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(2)
  @Max(1000)
  maxEntries?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  prizes?: string[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  rules?: string | null;
}

export class CreateTournamentDto extends TournamentFieldsDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsIn(SPORT_FAMILY_IDS, { message: 'Deporte no válido' })
  sport!: string;
}

export class UpdateTournamentDto extends TournamentFieldsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(SPORT_FAMILY_IDS, { message: 'Deporte no válido' })
  sport?: string;
}

export class TournamentStatusDto {
  @IsIn(TOURNAMENT_STATUSES)
  status!: (typeof TOURNAMENT_STATUSES)[number];
}

export class ListPublicTournamentsDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clubId?: string;
}

export class CreateEntryDto {
  @IsString()
  @MaxLength(40)
  tournamentId!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  teamName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class ReviewEntryDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'PENDING'])
  status!: 'ACCEPTED' | 'REJECTED' | 'PENDING';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}
