import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePlayerPaymentDto {
  @IsString()
  clubId!: string;

  @IsString()
  playerId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(3000)
  year!: number;

  @Type(() => Number)
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsIn(['paid', 'pending', 'overdue'])
  status?: 'paid' | 'pending' | 'overdue';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  paymentMethod?: string;
}