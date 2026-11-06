import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { STROKES, TIME_STATUSES } from '../swim-rules';

export class CreateCompetitionDto {
  @IsString() clubId!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsString() @MaxLength(160) venue?: string;
  @IsOptional() @IsIn([25, 50]) poolLength?: number;
  @IsOptional() @IsString() clubTournamentId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateCompetitionDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(160) venue?: string;
  @IsOptional() @IsIn([25, 50]) poolLength?: number;
  @IsOptional() @IsIn(['draft', 'open', 'finished']) status?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateEventDto {
  @IsIn(STROKES as unknown as string[]) stroke!: string;
  @IsInt() @Min(25) @Max(1500) distance!: number;
  @IsOptional() @IsIn(['F', 'M', 'X']) gender?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
}

export class TimeEntryDto {
  @IsString() playerId!: string;
  @IsInt() @Min(0) @Max(36_000_000) timeMs!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsInt({ each: true }) splits?: number[];
  @IsOptional() @IsIn(TIME_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) lane?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) heat?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class SaveTimesDto {
  @IsString() clubId!: string;
  @IsIn(STROKES as unknown as string[]) stroke!: string;
  @IsInt() @Min(25) @Max(1500) distance!: number;
  @IsOptional() @IsIn([25, 50]) poolLength?: number;
  @IsOptional() @IsIn(['training', 'meet']) source?: string;
  @IsOptional() @IsString() eventId?: string;
  @IsOptional() @IsDateString() recordedAt?: string;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => TimeEntryDto)
  entries!: TimeEntryDto[];
}

export class UpdateTimeDto {
  @IsOptional() @IsInt() @Min(0) @Max(36_000_000) timeMs?: number;
  @IsOptional() @IsIn(TIME_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
