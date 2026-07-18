import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  clubId?: string;

  @IsOptional()
  @IsString()
  leagueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}
