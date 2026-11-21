import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CoachProfileDto {
  @IsString() @MinLength(2) @MaxLength(60) displayName!: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(1200) bio?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  sports?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  levels?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  zones?: string[];
  @IsOptional() @IsString() @MaxLength(40) whatsapp?: string | null;
  @IsOptional() @IsString() @MaxLength(60) instagram?: string | null;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class UpdateCoachProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) displayName?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(1200) bio?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  sports?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  levels?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  zones?: string[];
  @IsOptional() @IsString() @MaxLength(40) whatsapp?: string | null;
  @IsOptional() @IsString() @MaxLength(60) instagram?: string | null;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class ClassTypeDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsIn(['INDIVIDUAL', 'DUO', 'GROUP']) format!: 'INDIVIDUAL' | 'DUO' | 'GROUP';
  @IsOptional() @IsInt() @Min(1) @Max(12) capacity?: number;
  @IsInt() @Min(30) @Max(240) durationMinutes!: number;
  @IsNumber() @Min(0) @Max(10_000_000) price!: number;
  @IsOptional() @IsString() @MaxLength(30) sport?: string | null;
  @IsOptional() @IsString() @MaxLength(400) description?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AvailabilityItemDto {
  @IsInt() @Min(0) @Max(6) weekday!: number;
  @IsInt() @Min(0) @Max(1440) startMinute!: number;
  @IsInt() @Min(0) @Max(1440) endMinute!: number;
  @IsOptional() @IsString() @MaxLength(40) clubId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) facilityId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) locationText?: string | null;
}

export class AvailabilityDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityItemDto)
  items!: AvailabilityItemDto[];
}

export class BlockDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
  @IsOptional() @IsString() @MaxLength(120) reason?: string | null;
}

export class ClubLinkDto {
  @IsString() @MaxLength(40) clubId!: string;
  @IsOptional() @IsString() @MaxLength(300) message?: string | null;
}

export class CreateLessonDto {
  @IsOptional() @IsString() @MaxLength(40) classTypeId?: string | null;
  @IsOptional() @IsIn(['INDIVIDUAL', 'DUO', 'GROUP']) format?:
    'INDIVIDUAL' | 'DUO' | 'GROUP';
  @IsOptional() @IsInt() @Min(1) @Max(12) capacity?: number;
  @Matches(DATE) date!: string;
  @IsInt() @Min(0) @Max(1425) startMinute!: number;
  @IsOptional() @IsInt() @Min(30) @Max(240) durationMinutes?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10_000_000) price?: number;
  @IsOptional() @IsString() @MaxLength(40) clubId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) facilityId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) locationText?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  studentIds?: string[];
  @IsOptional() @IsBoolean() openToJoin?: boolean;
  @IsOptional() @IsString() @MaxLength(400) notes?: string | null;
}

export class ReasonDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string | null;
}

export class AttendanceItemDto {
  @IsString() @MaxLength(40) participantId!: string;
  @IsBoolean() present!: boolean;
}

export class CompleteLessonDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  attendance!: AttendanceItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class StudentDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(120) email?: string | null;
  @IsOptional() @IsString() @MaxLength(20) level?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @IsOptional() @Matches(DATE) birthDate?: string | null;
  @IsOptional() @IsIn(['diestro', 'zurdo', 'ambidiestro']) hand?: string | null;
  @IsOptional() @IsIn(['drive', 'reves', 'ambos']) side?: string | null;
  @IsOptional() @IsString() @MaxLength(600) goals?: string | null;
  @IsOptional() @IsObject() skills?: Record<string, number> | null;
}

export class UpdateStudentDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(120) email?: string | null;
  @IsOptional() @IsString() @MaxLength(20) level?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Matches(DATE) birthDate?: string | null;
  @IsOptional() @IsIn(['diestro', 'zurdo', 'ambidiestro']) hand?: string | null;
  @IsOptional() @IsIn(['drive', 'reves', 'ambos']) side?: string | null;
  @IsOptional() @IsString() @MaxLength(600) goals?: string | null;
  @IsOptional() @IsObject() skills?: Record<string, number> | null;
}

export class NoteDto {
  @IsString() @MinLength(1) @MaxLength(1000) text!: string;
  @IsOptional() @IsString() @MaxLength(40) lessonId?: string | null;
}

export class PackDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsInt() @Min(1) @Max(100) totalClasses!: number;
  @IsNumber() @Min(0) @Max(100_000_000) price!: number;
  @IsOptional() @Matches(DATE) expiresAt?: string | null;
}

export class PaymentDto {
  @IsNumber() @Min(1) @Max(100_000_000) amount!: number;
  @IsIn(['cash', 'transfer', 'other']) method!: 'cash' | 'transfer' | 'other';
  @IsOptional() @IsString() @MaxLength(40) packId?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  participantIds?: string[];
  @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

export class LessonRequestDto {
  @IsString() @MaxLength(60) coach!: string;
  @IsString() @MaxLength(40) classTypeId!: string;
  @Matches(DATE) date!: string;
  @IsInt() @Min(0) @Max(1425) startMinute!: number;
  @IsOptional() @IsString() @MaxLength(80) partnerName?: string | null;
  @IsOptional() @IsString() @MaxLength(300) message?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(20) level?: string | null;
}

export class JoinLessonDto {
  @IsOptional() @IsString() @MaxLength(300) message?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(20) level?: string | null;
}

export class StaffPadelDto {
  @IsOptional() @IsString() @MaxLength(60) displayName?: string | null;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class StaffPublicDto {
  @IsBoolean() isPublic!: boolean;
}
