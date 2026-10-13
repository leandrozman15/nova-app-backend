import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  tournamentPublishFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  tournamentEntryFee?: number;
}

export class ListChargesDto {
  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'VOIDED'])
  status?: 'PENDING' | 'PAID' | 'VOIDED';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clubId?: string;
}

export class MarkChargesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['PAID', 'PENDING', 'VOIDED'])
  status!: 'PAID' | 'PENDING' | 'VOIDED';
}

export class AddPlatformAdminDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsIn(['SUPERADMIN', 'SUPPORT'])
  role!: 'SUPERADMIN' | 'SUPPORT';
}

export class UpdatePlatformAdminDto {
  @IsOptional()
  @IsIn(['SUPERADMIN', 'SUPPORT'])
  role?: 'SUPERADMIN' | 'SUPPORT';

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListAuditDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityId?: string;
}
