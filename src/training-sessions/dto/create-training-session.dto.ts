import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTrainingSessionDto {
  @IsString()
  clubId!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @Type(() => Date)
  @IsDate()
  scheduledAt!: Date;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
