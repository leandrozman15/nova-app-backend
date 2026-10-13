import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @MaxLength(60)
  clubId!: string;

  @IsString()
  @MaxLength(60)
  facilityId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato AAAA-MM-DD',
  })
  date!: string;

  /** Formato anterior: hora en punto. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1425)
  startMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 60, 90, 120])
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;
}

export class SyncBookingPaymentDto {
  @IsString()
  @Matches(/^\d{1,20}$/, { message: 'Identificador de pago inválido' })
  paymentId!: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class SlotsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato AAAA-MM-DD',
  })
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 60, 90, 120])
  duration?: number;
}

export class ClubBookingsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
