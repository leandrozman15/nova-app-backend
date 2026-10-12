import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterFreeUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
