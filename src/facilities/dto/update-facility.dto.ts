import { Type } from 'class-transformer';
import {
  IsIn,
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { FACILITY_SPORT_IDS } from '../facility-sports';

export class UpdateFacilityDto {
  @IsOptional()
  @IsString()
  clubId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  typeLabel?: string;

  /** Deporte del catálogo (futbol_5, padel, …); null = sin deporte. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(FACILITY_SPORT_IDS, { message: 'Deporte no válido' })
  sport?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  statusLabel?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  surfaceType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @IsObject()
  capacity?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  /** Se puede reservar online desde la app (requiere precio por hora). */
  @IsOptional()
  @IsBoolean()
  bookable?: boolean;

  /** Precio del turno de 1 hora, en la moneda del club. null lo borra. */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  hourlyPrice?: number | null;
}
