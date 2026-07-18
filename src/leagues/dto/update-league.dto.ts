import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLeagueDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  season?: string;

  @IsOptional()
  @IsString()
  clubId?: string;
}
