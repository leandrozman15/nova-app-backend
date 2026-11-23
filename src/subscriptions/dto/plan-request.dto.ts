import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const PLAN_REQUEST_KINDS = [
  'ACTIVATION',
  'EXTRA_USERS',
  'INTEGRATIONS',
  'BUFFET',
  'PAYMENT',
] as const;

export class PlanRequestDto {
  @IsIn(PLAN_REQUEST_KINDS)
  kind!: (typeof PLAN_REQUEST_KINDS)[number];

  /** EXTRA_USERS: bloques a sumar. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  extraBlocks?: number;

  /** PAYMENT: mensualidad pagada. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  invoiceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100_000_000)
  amount?: number;

  /** Número de operación o comprobante de la transferencia. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ResolvePlanRequestDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  response?: string;
}

export class ListPlanRequestsDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}
