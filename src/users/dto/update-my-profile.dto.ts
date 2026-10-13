import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Datos que el usuario libre completa desde la app pública. */
export class UpdateMyProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  /** Celular de contacto para el club: dígitos, espacios, +, -, paréntesis. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[\d\s()-]{8,25}$/, {
    message: 'Ingresá un teléfono válido (solo números, +, espacios o guiones).',
  })
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  sports?: string[];
}
