
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateMatchEventDto {
  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  playerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minute?: number;

  @IsIn(['goal', 'own_goal', 'yellow_card', 'red_card', 'substitution', 'note'])
  type!: 'goal' | 'own_goal' | 'yellow_card' | 'red_card' | 'substitution' | 'note';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
