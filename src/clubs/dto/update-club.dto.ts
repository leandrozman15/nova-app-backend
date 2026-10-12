import { Type } from 'class-transformer';
import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { IsPublicMediaUrl } from '../../common/validation/public-media-url';

export class UpdateClubDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  cuit?: string;

  @IsOptional()
  @IsString()
  foundationDate?: string;

  @IsOptional()
  @IsString()
  municipalityId?: string;

  @IsOptional()
  @IsString()
  leagueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  municipalityName?: string;

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
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  billingEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  facebook?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  // Vidriera pública. null borra la ubicación.
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number | null;

  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  publicFacilities?: boolean;

  @IsOptional()
  @IsBoolean()
  publicSchools?: boolean;

  @IsOptional()
  @IsBoolean()
  publicCoaches?: boolean;

  @IsOptional()
  @IsBoolean()
  publicShop?: boolean;

  /** Portada de la ficha pública. null la quita. */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsPublicMediaUrl()
  coverUrl?: string | null;
}
