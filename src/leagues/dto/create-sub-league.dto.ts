import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSubLeagueDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  season?: string;
}
