import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SetAutoDebitDto {
  @IsBoolean() active!: boolean;

  @IsOptional() @IsIn(['cbu', 'tarjeta']) method?: 'cbu' | 'tarjeta';

  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) label?: string;
}

export class CollectAutoDebitDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month!: number;
  @Type(() => Number) @IsInt() @Min(2020) @Max(2100) year!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (AAAA-MM-DD)' })
  paymentDate!: string;

  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) playerIds!: string[];
}
