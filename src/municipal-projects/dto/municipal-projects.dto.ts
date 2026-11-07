import { IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Max, Min, MinLength } from 'class-validator';

import { PROJECT_CATEGORIES, PROJECT_PRIORITIES, PROJECT_STATUSES } from '../municipal-projects-rules';

const cats = PROJECT_CATEGORIES as unknown as string[];
const prios = PROJECT_PRIORITIES as unknown as string[];

export class CreateProjectDto {
  @IsString() municipalityId!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(cats) category?: string;
  @IsOptional() @IsIn(prios) priority?: string;
  @IsOptional() @IsString() @MaxLength(140) responsible?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number | null;
  @IsOptional() @IsString() @MaxLength(200) address?: string | null;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(cats) category?: string;
  @IsOptional() @IsIn(prios) priority?: string;
  @IsOptional() @IsString() @MaxLength(140) responsible?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number | null;
  @IsOptional() @IsString() @MaxLength(200) address?: string | null;
}

export class ChangeStatusDto {
  @IsIn(PROJECT_STATUSES as unknown as string[]) status!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class NoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) note!: string;
}

export class LineDto {
  @IsString() @MaxLength(160) concept!: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsInt() @Min(0) @Max(2_000_000_000) plannedAmount!: number;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) spentAmount?: number;
}

export class UpdateLineDto {
  @IsOptional() @IsString() @MaxLength(160) concept?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) plannedAmount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) spentAmount?: number;
}

export class RecordStaffDto {
  @IsString() municipalityId!: string;
  @IsString() firebaseUid!: string;
  @IsEmail() email!: string;
  @IsString() @MaxLength(140) name!: string;
}
