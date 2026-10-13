import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePlanDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  monthlyPrice!: number;
}

export class UpdatePlanDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  monthlyPrice?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Alta o cambio de la suscripción de un club. */
export class UpsertSubscriptionDto {
  @IsString()
  @MaxLength(40)
  planId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  customPrice?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  billingDay?: number;

  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE'])
  status?: 'TRIAL' | 'ACTIVE';

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (AAAA-MM-DD)' })
  trialEndsAt?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReasonDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Contá el motivo (queda en la auditoría).' })
  @MaxLength(300)
  reason!: string;
}

export class GenerateInvoicesDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mes inválido (AAAA-MM)' })
  period!: string;
}

export class ListInvoicesDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'VOID', 'OVERDUE'])
  status?: 'PENDING' | 'PAID' | 'VOID' | 'OVERDUE';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clubId?: string;
}

export class MarkInvoiceDto {
  @IsIn(['PAID', 'PENDING', 'VOID'])
  status!: 'PAID' | 'PENDING' | 'VOID';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  paymentMethod?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  paymentRef?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  notes?: string;
}
