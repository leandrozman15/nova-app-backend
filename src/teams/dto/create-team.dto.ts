import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  clubId!: string;

  @IsOptional()
  @IsString()
  leagueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}
