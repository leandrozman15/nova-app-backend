import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString() @MinLength(20) @MaxLength(4096) token!: string;
  @IsOptional() @IsIn(['android', 'ios', 'web']) platform?: string;
}

export class RemoveDeviceDto {
  @IsString() @MinLength(20) @MaxLength(4096) token!: string;
}

export class BroadcastDto {
  @IsString() @MinLength(2) @MaxLength(80) title!: string;
  @IsString() @MinLength(2) @MaxLength(300) body!: string;
  /** Ruta interna de la app que se abre al tocar la notificación (nunca un sitio externo). */
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^\/(?!\/)[\w\-./?=&%#]*$/, { message: 'url debe ser una ruta interna' }) url?: string;
}
