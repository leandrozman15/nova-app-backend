import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, Max, Min, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLeagueTournamentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(['regular', 'special'])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  format?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'finished'])
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['league', 'knockout', 'groups', 'groups_knockout'])
  formatType?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(16)
  groupCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  advancePerGroup?: number;

  @IsOptional()
  @IsBoolean()
  thirdPlace?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clubIds?: string[];
}

export class UpdateLeagueTournamentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['regular', 'special'])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  format?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'finished'])
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['league', 'knockout', 'groups', 'groups_knockout'])
  formatType?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(16)
  groupCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  advancePerGroup?: number;

  @IsOptional()
  @IsBoolean()
  thirdPlace?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clubIds?: string[];
}
