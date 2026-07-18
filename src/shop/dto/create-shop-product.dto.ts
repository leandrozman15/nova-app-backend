import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class ShopProductSizeDto {
  @IsString()
  @MaxLength(30)
  label!: string;

  @Type(() => Number)
  @IsNumber()
  stock!: number;
}

export class CreateShopProductDto {
  @IsString()
  clubId!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  price!: number;

  @IsString()
  @MaxLength(60)
  category!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopProductSizeDto)
  sizes?: ShopProductSizeDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sports?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}