import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const DOC_SLOTS = ['dni_front', 'dni_back', 'medical', 'other'] as const;

export class ConsentDto {
  /** Quién acepta: la persona o su madre/padre/tutor. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  acceptedBy!: string;

  @IsIn(['self', 'madre', 'padre', 'tutor'])
  relationship!: string;

  @IsString()
  @MaxLength(20)
  textVersion!: string;
}

export class UploadDocumentDto {
  @IsString()
  @IsNotEmpty()
  clubId!: string;

  /** Para los espacios fijos es el nombre del espacio; para "other", other-<n>. */
  @Matches(/^[A-Za-z0-9_-]{1,60}$/)
  docId!: string;

  @IsIn(DOC_SLOTS as unknown as string[])
  slot!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  /** Solo certificado médico (YYYY-MM-DD). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expiresAt?: string;

  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  contentType!: string;

  @IsString()
  @IsNotEmpty()
  dataBase64!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConsentDto)
  consent?: ConsentDto;
}
