import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { PADEL_CATEGORY_CODES } from '../padel-categories';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DNI = /^\d[\d.\s]{5,12}$/;

export class DeclareProfileDto {
  @Matches(DNI, { message: 'DNI inválido' })
  dni!: string;

  @IsIn(PADEL_CATEGORY_CODES, { message: 'Categoría inválida' })
  category!: string;
}

export class ClubProfileDto extends DeclareProfileDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name!: string;
}

export class RecategorizeDto {
  @IsIn(PADEL_CATEGORY_CODES, { message: 'Categoría inválida' })
  category!: string;

  /** inactividad | lesion | ajuste (nivel real) */
  @IsIn(['inactividad', 'lesion', 'ajuste'])
  reason!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}
