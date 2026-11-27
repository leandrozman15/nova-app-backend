import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class BankRowDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @MaxLength(300)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  /** Positivo = acreditación, negativo = débito. */
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;
}

export class ImportStatementDto {
  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => BankRowDto)
  rows!: BankRowDto[];
}

export class MatchMovementDto {
  @IsString()
  feeId!: string;
}

export class RecordMovementDto {
  @IsString()
  @MaxLength(60)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class IgnoreMovementDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
