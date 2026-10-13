import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { isValidTimeZone } from '../../bookings/booking-time';
import { CLUB_AMENITY_IDS } from '../club-amenities';
import { IsPublicMediaUrl } from '../../common/validation/public-media-url';

@ValidatorConstraint({ name: 'timeZone' })
class TimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidTimeZone(value);
  }

  defaultMessage() {
    return 'Zona horaria inválida';
  }
}

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

  /** % de seña sobre el precio del turno (0 a 100). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  depositPercent?: number;

  /** Zona horaria IANA de los turnos (ej. America/Argentina/Buenos_Aires). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Validate(TimeZoneConstraint)
  timezone?: string;

  /** off = sin reservas; request = solicitud sin seña; deposit = seña por Mercado Pago. */
  @IsOptional()
  @IsIn(['off', 'request', 'deposit'])
  bookingMode?: 'off' | 'request' | 'deposit';

  /** Servicios del club (catálogo club-amenities). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsIn(CLUB_AMENITY_IDS, { each: true, message: 'Servicio no válido' })
  amenities?: string[];
}
