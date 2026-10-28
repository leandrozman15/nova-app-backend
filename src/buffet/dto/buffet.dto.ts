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
  ValidateNested,
} from 'class-validator';

import { BUFFET_MODES, PAYMENT_METHODS } from '../buffet.logic';

export class UpdateBuffetDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsIn(BUFFET_MODES as unknown as string[]) mode?: string;
  @IsOptional() @IsNumber() @Min(0) canonAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percent?: number | null;
  @IsOptional() @IsString() @MaxLength(120) concessionaire?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateProductDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
  @IsOptional() @IsBoolean() trackStock?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AdjustStockDto {
  /** Positivo = ingreso de mercadería; negativo = merma/ajuste. */
  @IsInt() delta!: number;
  @IsIn(['purchase', 'adjust', 'loss']) reason!: 'purchase' | 'adjust' | 'loss';
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class OpenSessionDto {
  @IsNumber() @Min(0) openingAmount!: number;
}

export class CloseSessionDto {
  @IsNumber() @Min(0) countedCash!: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsBoolean() reportToTreasury!: boolean;
}

export class SaleItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) @Max(999) quantity!: number;
}

export class CreateSaleDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items!: SaleItemDto[];
  @IsIn(PAYMENT_METHODS as unknown as string[]) paymentMethod!: string;
}

export class VoidSaleDto {
  @IsString() @MaxLength(200) reason!: string;
}

export class RegisterCanonDto {
  /** Período YYYY-MM al que corresponde el canon (evita duplicados). */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
}
