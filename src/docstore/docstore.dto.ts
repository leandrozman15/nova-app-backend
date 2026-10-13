import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FilterDto {
  @IsString() @MaxLength(120) field!: string;
  @IsIn([
    '==',
    '!=',
    '<',
    '<=',
    '>',
    '>=',
    'in',
    'not-in',
    'array-contains',
    'array-contains-any',
  ])
  op!: string;
  @Allow() value!: unknown;
}

export class OrderDto {
  @IsString() @MaxLength(120) field!: string;
  @IsIn(['asc', 'desc']) direction!: 'asc' | 'desc';
}

export class QueryDto {
  @IsOptional() @IsString() @MaxLength(600) path?: string;
  @IsOptional() @IsString() @MaxLength(80) group?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterDto)
  where?: FilterDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderDto)
  orderBy?: OrderDto[];
  @IsOptional() @IsInt() @Min(0) @Max(5000) limit?: number;
}

export class PathDto {
  @IsString() @MaxLength(600) path!: string;
}

export class WriteDto {
  @IsString() @MaxLength(600) path!: string;
  @IsObject() data!: Record<string, unknown>;
  @IsOptional() @IsBoolean() merge?: boolean;
}

export class MigrationDto {
  @IsOptional() @IsString() @MaxLength(80) clubId?: string;
  @IsOptional() @IsBoolean() force?: boolean;
}
