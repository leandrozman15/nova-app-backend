import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListPublicClubsDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  /** Radio de búsqueda en km (solo si se envía lat/lng). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(300)
  radiusKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sport?: string;

  /** Búsqueda por nombre o ciudad. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
