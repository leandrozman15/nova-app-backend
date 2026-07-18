import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInjuryReportDto {
  @IsOptional()
  @IsString()
  clubId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  playerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'recovered'])
  status?: 'active' | 'recovered';

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
