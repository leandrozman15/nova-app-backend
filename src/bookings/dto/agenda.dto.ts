import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
} from 'class-validator';

const KINDS = [
  'ALQUILER',
  'ENTRENAMIENTO',
  'PARTIDO',
  'MANTENIMIENTO',
] as const;
const METHODS = ['cash', 'transfer', 'other'] as const;
const DURATION = [30, 60, 90, 120];

export class AgendaQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class AgendaBookingDto {
  @IsString()
  @MaxLength(60)
  facilityId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1425)
  startMinute!: number;

  @Type(() => Number)
  @IsIn(DURATION)
  durationMinutes!: number;

  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  clientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  /** true = turno fijo todas las semanas desde esa fecha. */
  @IsOptional()
  @IsBoolean()
  repeatWeekly?: boolean;
}

export class RecurringDto {
  @IsString()
  @MaxLength(60)
  facilityId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1425)
  startMinute!: number;

  @Type(() => Number)
  @IsIn(DURATION)
  durationMinutes!: number;

  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  clientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;
}

export class UpdateRecurringDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class EndRecurringDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
}

export class DepositDto {
  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100_000_000)
  amount?: number;
}

export class TurnPaymentDto {
  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100_000_000)
  amount!: number;
}

export class AttendanceDto {
  @IsOptional()
  @IsIn(['SHOWED', 'NO_SHOW', null])
  attendance?: 'SHOWED' | 'NO_SHOW' | null;
}

export class ReleaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class AgendaSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1380)
  openMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(1440)
  closeMinute?: number;

  @IsOptional()
  @IsBoolean()
  requireDeposit?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  depositAlias?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(72)
  depositHoldHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  depositPercent?: number;
}

export class FacilityDurationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @Type(() => Number)
  @IsIn(DURATION, { each: true })
  durations!: number[];
}

export class OccupancyQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1380)
  fromMinute?: number;
}
