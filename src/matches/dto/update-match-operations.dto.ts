import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMatchOperationsDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  busDepartureTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  jersey?: string;
}