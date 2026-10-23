import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SuspendMatchDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  /** Categorías afectadas; vacío o ausente = todas las del club. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  categories?: string[];

  /** Solo roles de liga/empresa: club en nombre del cual se suspende. */
  @IsOptional()
  @IsString()
  clubId?: string;
}

export class RescheduleMatchDto {
  @Type(() => Date)
  @IsDate()
  newDate!: Date;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  venue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}
