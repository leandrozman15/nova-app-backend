import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFacilityDto {
  @IsString()
  clubId!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(60)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  typeLabel?: string;

  @IsString()
  @MaxLength(40)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  statusLabel?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  surfaceType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @IsObject()
  capacity?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}