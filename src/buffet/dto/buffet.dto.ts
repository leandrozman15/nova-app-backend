import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

import { BUFFET_MODES, PAYMENT_METHODS } from '../buffet.logic';

/** Foto chica (data URL webp/jpeg/png) o URL https. */
export const PRODUCT_IMAGE_REGEX = /^(data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+|https:\/\/\S+)$/;
export const PRODUCT_IMAGE_MAX = 150_000;

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
  @IsOptional() @IsString() @MaxLength(PRODUCT_IMAGE_MAX) @Matches(PRODUCT_IMAGE_REGEX) imageUrl?: string;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @ValidateIf((_, v) => v !== null)
  @IsOptional() @IsString() @MaxLength(PRODUCT_IMAGE_MAX) @Matches(PRODUCT_IMAGE_REGEX) imageUrl?: string | null;
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

export class PaymentLineDto {
  @IsIn(PAYMENT_METHODS as unknown as string[]) method!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000_000) amount!: number;
}

/**
 * Una venta se cobra de una de tres formas:
 *  · `paymentMethod`: un solo medio por el total (lo que mandan las versiones anteriores de la app);
 *  · `payments`: pago dividido, varios medios que suman el total;
 *  · `bookingId`: se carga a la cuenta de un alquiler y se cobra al cerrarla.
 */
export class CreateSaleDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items!: SaleItemDto[];
  @IsOptional() @IsIn(PAYMENT_METHODS as unknown as string[]) paymentMethod?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => PaymentLineDto)
  payments?: PaymentLineDto[];
  @IsOptional() @IsString() @MaxLength(80) bookingId?: string;
  /** Id único generado por el dispositivo; si ya existe, se devuelve la venta original. */
  @IsOptional() @IsString() @MaxLength(80) clientRef?: string;
}

/** Cierre de la cuenta de un alquiler: lo pagado (consumos + saldo de la cancha) en uno o más medios. */
export class SettleAccountDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => PaymentLineDto)
  payments!: PaymentLineDto[];
}

export class VoidSaleDto {
  @IsString() @MaxLength(200) reason!: string;
}

export class RegisterCanonDto {
  /** Período YYYY-MM al que corresponde el canon (evita duplicados). */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period!: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
}

export class DeleteProductsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsString({ each: true }) ids!: string[];
}
