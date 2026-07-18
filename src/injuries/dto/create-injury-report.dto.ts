import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInjuryReportDto {
  @IsString()
  clubId!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsString()
  playerId!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
