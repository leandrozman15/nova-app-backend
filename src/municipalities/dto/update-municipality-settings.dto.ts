import { IsEmail, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';

/** Opcional: undefined, null o vacío ("" borra el dato) se aceptan sin validar el formato. */
const IsOptional = () => ValidateIf((_, v) => v !== undefined && v !== null && v !== '');

/** Logo: imagen comprimida en data URL (≈ hasta 400 KB) o enlace https. */
const LOGO = /^(data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+|https:\/\/\S+)$/;
const HTTPS = { protocols: ['https'], require_protocol: true };

export class UpdateMunicipalitySettingsDto {
  @IsOptional() @IsString() @MaxLength(560_000) @Matches(LOGO, { message: 'El logo debe ser una imagen PNG, JPG o WebP' }) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(140) secretariaName?: string;
  @IsOptional() @IsString() @MaxLength(120) responsibleName?: string;
  @IsOptional() @IsString() @MaxLength(120) responsibleRole?: string;
  @IsOptional() @IsEmail() @MaxLength(160) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) @Matches(/^[0-9+()\-\s]*$/, { message: 'Teléfono inválido' }) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) @Matches(/^[0-9+()\-\s]*$/, { message: 'WhatsApp inválido' }) whatsapp?: string;
  @IsOptional() @IsUrl(HTTPS) @MaxLength(300) website?: string;
  @IsOptional() @IsUrl(HTTPS) @MaxLength(300) facebook?: string;
  @IsOptional() @IsUrl(HTTPS) @MaxLength(300) instagram?: string;
}
