import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateFacilityRentalDto {
  @IsString()
  clubId!: string;

  @IsString()
  facilityId!: string;

  @IsString()
  @MaxLength(160)
  clientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsBoolean()
  isRecurrent?: boolean;

  @IsString()
  @MaxLength(12)
  day!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  hour!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
