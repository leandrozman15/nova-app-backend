import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClubDto {
  @IsString()
  @MaxLength(120)
  name!: string;

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
  @MaxLength(60)
  sport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}
