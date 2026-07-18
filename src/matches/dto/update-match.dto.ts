import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMatchDto {
  @IsOptional()
  @IsString()
  leagueId?: string;

  @IsOptional()
  @IsString()
  homeTeamId?: string;

  @IsOptional()
  @IsString()
  awayTeamId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @IsOptional()
  @IsIn(['scheduled', 'live', 'played', 'canceled'])
  status?: 'scheduled' | 'live' | 'played' | 'canceled';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  venue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}
