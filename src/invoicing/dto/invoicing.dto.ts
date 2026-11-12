import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConnectInvoicingDto {
  @IsString() @MinLength(10) @MaxLength(500) token!: string;
  @IsOptional() @IsIn(['factura_c', 'factura_b']) voucherType?: string;
}

export class UpdateInvoicingDto {
  @IsOptional() @IsIn(['factura_c', 'factura_b']) voucherType?: string;
  @IsOptional() @IsBoolean() autoIssue?: boolean;
}
