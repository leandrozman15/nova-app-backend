import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateProgramDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) discipline?: string;
  /** A quién va dirigido: adultos mayores, mujeres, niños, todos... */
  @IsOptional() @IsString() @MaxLength(80) audience?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  /** Días y horarios en texto libre: "Lunes y miércoles 10:00 a 11:00". */
  @IsOptional() @IsString() @MaxLength(160) scheduleText?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5000) capacity?: number;
  @IsOptional() @IsIn(['open', 'closed']) status?: 'open' | 'closed';
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class UpdateProgramDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) discipline?: string;
  @IsOptional() @IsString() @MaxLength(80) audience?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsString() @MaxLength(160) scheduleText?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5000) capacity?: number;
  @IsOptional() @IsIn(['open', 'closed']) status?: 'open' | 'closed';
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class CreateEnrollmentDto {
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @IsOptional() @IsString() @MaxLength(20) dni?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class AttendanceRecordDto {
  @IsString() enrollmentId!: string;
  @IsBoolean() present!: boolean;
}

export class SaveAttendanceDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];
}
