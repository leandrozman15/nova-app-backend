import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  leagueId!: string;

  @IsString()
  homeTeamId!: string;

  @IsString()
  awayTeamId!: string;

  @Type(() => Date)
  @IsDate()
  scheduledAt!: Date;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  venue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  busDepartureTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  jersey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}
