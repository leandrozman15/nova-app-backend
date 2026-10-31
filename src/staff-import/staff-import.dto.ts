import { Type } from 'class-transformer';
import { Allow, ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, ValidateNested } from 'class-validator';

/** Una fila de la planilla tal como llega (los valores se validan en el servicio). */
export class StaffImportRowDto {
  @Type(() => Number) @IsInt() row!: number;
  @Allow() firstName?: unknown;
  @Allow() lastName?: unknown;
  @Allow() dni?: unknown;
  @Allow() birthDate?: unknown;
  @Allow() role?: unknown;
  @Allow() email?: unknown;
  @Allow() phone?: unknown;
  @Allow() sport?: unknown;
  @Allow() specialty?: unknown;
  @Allow() license?: unknown;
  @Allow() membershipNumber?: unknown;
  @Allow() address?: unknown;
  @Allow() bloodType?: unknown;
  @Allow() emergencyContact?: unknown;
  @Allow() emergencyPhone?: unknown;
  @Allow() parkingIncluded?: unknown;
}

export class StaffImportDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => StaffImportRowDto)
  rows!: StaffImportRowDto[];

  /** true = solo revisar, no crea nada. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
}
