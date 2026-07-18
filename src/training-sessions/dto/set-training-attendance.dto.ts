import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetTrainingAttendanceDto {
  @IsString()
  playerId!: string;

  @IsIn(['going', 'not_going', 'unknown'])
  status!: 'going' | 'not_going' | 'unknown';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
