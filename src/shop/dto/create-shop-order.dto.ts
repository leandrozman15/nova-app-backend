import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, IsNumber } from 'class-validator';

export class CreateShopOrderDto {
  @IsString()
  clubId!: string;

  @IsString()
  customerExternalId!: string;

  @IsString()
  @MaxLength(160)
  customerName!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MaxLength(160)
  productName!: string;

  @IsOptional()
  @IsString()
  productImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  size?: string;

  @Type(() => Number)
  @IsNumber()
  price!: number;
}