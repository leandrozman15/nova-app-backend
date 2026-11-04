import { IsArray, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMunicipalityDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsNumber()
  centerLat?: number;

  @IsOptional()
  @IsNumber()
  centerLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  /** Contorno [lat, lng][]; null borra el contorno. */
  @IsOptional()
  @IsArray()
  boundary?: number[][] | null;
}
