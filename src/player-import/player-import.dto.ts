import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  ValidateNested,
  IsObject,
} from 'class-validator';

/** Una fila de la planilla tal como llega (los valores se validan en el servicio). */
export class ImportRowDto {
  @Type(() => Number)
  @IsInt()
  row!: number;

  @Allow() firstName?: unknown;
  @Allow() lastName?: unknown;
  @Allow() dni?: unknown;
  @Allow() birthDate?: unknown;
  @Allow() gender?: unknown;
  @Allow() sport?: unknown;
  @Allow() category?: unknown;
  /** Rama del club donde va la categoría ("Fútbol infantil"). Vacía = deporte + rama. */
  @Allow() division?: unknown;
  @Allow() branch?: unknown;
  @Allow() position?: unknown;
  @Allow() membershipNumber?: unknown;
  @Allow() email?: unknown;
  @Allow() phone?: unknown;
  @Allow() address?: unknown;
  @Allow() locality?: unknown;
  @Allow() province?: unknown;
  @Allow() medicalCert?: unknown;
  @Allow() minorAuth?: unknown;
  @Allow() notes?: unknown;
}

export class PlayerImportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3000)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];

  /** true = solo revisar, no crea nada. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** true (por defecto) = crea las disciplinas y categorías de la planilla que el club no tiene. */
  @IsOptional()
  @IsBoolean()
  autoCreate?: boolean;
}

export class RestructureDto {
  /** true (por defecto) = solo muestra lo que haría. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** Nombre de la rama por deporte ({ football: "Fútbol infantil" }). Vacío = deporte + rama. */
  @IsOptional()
  @IsObject()
  names?: Record<string, string>;
}
