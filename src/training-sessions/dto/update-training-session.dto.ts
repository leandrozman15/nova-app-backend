import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTrainingSessionDto {
  @IsOptional()
  @IsString()
  clubId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @IsOptional()
  @IsIn(['scheduled', 'completed', 'canceled'])
  status?: 'scheduled' | 'completed' | 'canceled';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
