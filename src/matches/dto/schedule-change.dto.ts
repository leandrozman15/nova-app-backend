import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Cambio de horario: o se corre en minutos (atraso/adelanto) o se fija una fecha nueva. */
export class ScheduleChangeDto {
  /** Positivo = atrasado, negativo = adelantado. */
  @IsOptional()
  @IsInt()
  @Min(-720)
  @Max(1440)
  minutes?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  newDate?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
