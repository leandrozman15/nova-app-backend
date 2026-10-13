import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { IVA_CONDITIONS, STORE_CATEGORY_IDS } from '../store-categories';

const PERCENT = { maxDecimalPlaces: 2 } as const;

/** Foto del producto: URL https o imagen comprimida en el navegador (data URL). */
export const PRODUCT_IMAGE =
  /^(https:\/\/\S+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/;

// ─── Plataforma: comercios ──────────────────────────────────────────────────

export class CreateMerchantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  legalName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  tradeName!: string;

  @IsString()
  @Matches(/^[\d-\s]{11,14}$/, { message: 'CUIT inválido' })
  cuit!: string;

  @IsIn(IVA_CONDITIONS)
  ivaCondition!: (typeof IVA_CONDITIONS)[number];

  @IsEmail()
  @MaxLength(160)
  contactEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsIn(STORE_CATEGORY_IDS, { each: true })
  categories?: string[];

  /** Comisión propia de Fluxion para este comercio (vacío = la del club o la general). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(PERCENT)
  @Min(0)
  @Max(100)
  platformPercent?: number;
}

export class UpdateMerchantFiscalDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[\d-\s]{11,14}$/, { message: 'CUIT inválido' })
  cuit?: string;

  @IsOptional()
  @IsIn(IVA_CONDITIONS)
  ivaCondition?: (typeof IVA_CONDITIONS)[number];

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsIn(STORE_CATEGORY_IDS, { each: true })
  categories?: string[];

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class VerifyCuitDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}

export class InviteMerchantDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsIn(['ADMIN_COMERCIO', 'OPERADOR'])
  role?: 'ADMIN_COMERCIO' | 'OPERADOR';
}

export class ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

// ─── Plataforma: comisiones ─────────────────────────────────────────────────

export class SetCommissionRuleDto {
  @IsIn(['GLOBAL', 'CLUB', 'MERCHANT'])
  scope!: 'GLOBAL' | 'CLUB' | 'MERCHANT';

  @ValidateIf((dto: SetCommissionRuleDto) => dto.scope === 'CLUB')
  @IsString()
  @MaxLength(40)
  clubId?: string;

  @ValidateIf((dto: SetCommissionRuleDto) => dto.scope === 'MERCHANT')
  @IsString()
  @MaxLength(40)
  merchantId?: string;

  /** null = hereda (solo en reglas de club). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(PERCENT)
  @Min(0)
  @Max(100)
  platformPercent?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(PERCENT)
  @Min(0)
  @Max(100)
  clubPercent?: number | null;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ClearCommissionRuleDto {
  @IsIn(['CLUB', 'MERCHANT'])
  scope!: 'CLUB' | 'MERCHANT';

  @ValidateIf((dto: ClearCommissionRuleDto) => dto.scope === 'CLUB')
  @IsString()
  @MaxLength(40)
  clubId?: string;

  @ValidateIf((dto: ClearCommissionRuleDto) => dto.scope === 'MERCHANT')
  @IsString()
  @MaxLength(40)
  merchantId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class CommissionLimitsDto {
  @Type(() => Number)
  @IsNumber(PERCENT)
  @Min(0)
  @Max(100)
  platformMin!: number;

  @Type(() => Number)
  @IsNumber(PERCENT)
  @Min(0)
  @Max(100)
  platformMax!: number;

  @Type(() => Number)
  @IsNumber(PERCENT)
  @Min(0)
  @Max(100)
  clubMin!: number;

  @Type(() => Number)
  @IsNumber(PERCENT)
  @Min(0)
  @Max(100)
  clubMax!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class CommissionPreviewDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clubId?: string;
}

export class CommissionReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clubId?: string;

  @IsOptional()
  @IsIn(['PENDING', 'ACCRUED', 'VOID'])
  commissionStatus?: 'PENDING' | 'ACCRUED' | 'VOID';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  period?: string;
}

// ─── Portal del comercio ────────────────────────────────────────────────────

export class AcceptInvitationDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}

export class UpdateMerchantProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  logoUrl?: string;
}

export class SetPaymentAccountDto {
  @IsIn(['transfer', 'mercadopago', 'other'])
  provider!: 'transfer' | 'mercadopago' | 'other';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  holderName!: string;

  /** Alias o descripción de la cuenta. Nunca contraseñas ni tokens. */
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  accountLabel!: string;
}

export class ProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsIn(STORE_CATEGORY_IDS)
  category!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  stock!: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Matches(PRODUCT_IMAGE, { message: 'Imagen inválida' })
  @MaxLength(120_000)
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn(STORE_CATEGORY_IDS)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  stock?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Matches(PRODUCT_IMAGE, { message: 'Imagen inválida' })
  @MaxLength(120_000)
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

// ─── Club ───────────────────────────────────────────────────────────────────

export class ClubStoreSettingsDto {
  @IsBoolean()
  acceptMerchants!: boolean;

  @IsBoolean()
  paused!: boolean;

  @IsArray()
  @ArrayMaxSize(9)
  @IsIn(STORE_CATEGORY_IDS, { each: true })
  excludedCategories!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pickupHours?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  dailyCapacity?: number | null;
}

export class DeliverOrderDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código tiene 6 números' })
  pickupCode!: string;
}

// ─── App ────────────────────────────────────────────────────────────────────

export class ListStoreDto {
  @IsOptional()
  @IsIn(STORE_CATEGORY_IDS)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clubId?: string;
}

export class OrderItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clubProductId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  size?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;
}

export class CreateStoreOrderDto {
  @IsString()
  @MaxLength(40)
  pickupClubId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
