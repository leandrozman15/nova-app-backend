import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetMatchCallupDto {
  @IsString()
  playerExternalId!: string;

  @IsString()
  @MaxLength(160)
  playerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  playerPhoto?: string;

  @IsOptional()
  @IsIn(['pending', 'confirmed', 'unavailable'])
  status?: 'pending' | 'confirmed' | 'unavailable';
}