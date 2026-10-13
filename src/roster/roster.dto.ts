import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Campos de una ficha con la forma de la consola (se validan uno por uno en el servicio). */
export class FieldsDto {
  @IsObject()
  fields!: Record<string, unknown>;
}

export class PlayersQueryDto {
  @IsOptional() @IsString() @MaxLength(80) divisionId?: string;
  @IsOptional() @IsString() @MaxLength(80) teamId?: string;
  @IsOptional() @IsString() @MaxLength(60) sport?: string;
  @IsOptional()
  @IsIn(['active', 'pending', 'inactive', 'rejected'])
  status?: string;
}

export class DivisionsQueryDto {
  @IsOptional() @IsString() @MaxLength(60) sport?: string;
}

export class MigrationDto {
  @IsOptional() @IsString() @MaxLength(80) clubId?: string;
  @IsOptional() @IsBoolean() force?: boolean;
}
