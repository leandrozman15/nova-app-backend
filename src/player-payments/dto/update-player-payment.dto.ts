import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePlayerPaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(3000)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  amount?: number;

  /** Fecha en que entró el dinero (AAAA-MM-DD); por defecto, hoy. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate?: string;

  /** Intereses por mora cobrados junto con la cuota (se suman al ingreso de Tesorería). */
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  lateFeeAmount?: number;

  @IsOptional()
  @IsIn(['paid', 'pending', 'overdue'])
  status?: 'paid' | 'pending' | 'overdue';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  paymentMethod?: string;

  /** Vencimiento de la cuota (YYYY-MM-DD). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;
}
