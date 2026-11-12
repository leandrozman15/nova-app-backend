import { IsBoolean, IsOptional } from 'class-validator';

export class EmailSettingsDto {
  @IsOptional() @IsBoolean() receipts?: boolean;
  @IsOptional() @IsBoolean() invoices?: boolean;
  @IsOptional() @IsBoolean() feeNotices?: boolean;
  @IsOptional() @IsBoolean() overdue?: boolean;
  @IsOptional() @IsBoolean() welcome?: boolean;
}
