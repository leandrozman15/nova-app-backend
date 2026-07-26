import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
