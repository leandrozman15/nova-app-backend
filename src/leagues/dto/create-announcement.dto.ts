import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clubIds?: string[];
}
