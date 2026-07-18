import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateClubDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  municipalityName?: string;
}
