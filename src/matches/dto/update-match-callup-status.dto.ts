import { IsIn } from 'class-validator';

export class UpdateMatchCallupStatusDto {
  @IsIn(['pending', 'confirmed', 'unavailable'])
  status!: 'pending' | 'confirmed' | 'unavailable';
}