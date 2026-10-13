import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

export const PRICE_UNITS = [
  'mes',
  'clase',
  'semana',
  'trimestre',
  'año',
] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ScheduleSlotDto {
  /** 0 = lunes … 6 = domingo. */
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @Matches(TIME, { message: 'Hora de inicio inválida (HH:MM)' })
  start!: string;

  @Matches(TIME, { message: 'Hora de fin inválida (HH:MM)' })
  end!: string;
}

/** Campos comunes de alta y edición (el nombre va en cada DTO). */
class ActivityFieldsDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  sport?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  audience?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(1500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  coaches?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule?: ScheduleSlotDto[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(PRICE_UNITS)
  priceUnit?: (typeof PRICE_UNITS)[number] | null;

  @IsOptional()
  @IsBoolean()
  showPrice?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

export class CreateActivityDto extends ActivityFieldsDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}

export class UpdateActivityDto extends ActivityFieldsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
}

export class CreateInquiryDto {
  /** Id de la actividad, o "disc_<id>" para una disciplina de la consola. */
  @IsString()
  @MaxLength(80)
  activityId!: string;

  /** Obligatorio para disciplinas (su id no es global). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  clubId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class InquiryStatusDto {
  @IsIn(['NEW', 'CONTACTED', 'CLOSED'])
  status!: 'NEW' | 'CONTACTED' | 'CLOSED';
}

/** Lo que el club define en la app para una disciplina de la consola. */
export class DisciplineSettingsDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(1500)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(PRICE_UNITS)
  priceUnit?: (typeof PRICE_UNITS)[number] | null;

  @IsOptional()
  @IsBoolean()
  showPrice?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
