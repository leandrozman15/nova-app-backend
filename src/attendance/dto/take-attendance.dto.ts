import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'justified'] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUSES)[number];

export class AttendanceRecordDto {
  @IsString()
  playerId!: string;

  @IsIn(ATTENDANCE_STATUSES as unknown as string[])
  status!: AttendanceStatusValue;
}

export class TakeAttendanceDto {
  @IsString()
  clubId!: string;

  @IsString()
  teamId!: string;

  @IsOptional()
  @IsString()
  divisionId?: string;

  /** Día del entrenamiento (YYYY-MM-DD). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];
}
