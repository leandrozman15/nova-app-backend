import { ArrayMaxSize, IsArray, IsOptional, ValidateIf } from 'class-validator';

import { IsPublicMediaUrl } from '../../common/validation/public-media-url';

export const MAX_FACILITY_PHOTOS = 12;

export class UpdateFacilityPhotosDto {
  /** Orden final de la galería. Reemplaza la lista completa. */
  @IsArray()
  @ArrayMaxSize(MAX_FACILITY_PHOTOS)
  @IsPublicMediaUrl({ each: true })
  photos!: string[];

  /** Portada: debe ser una de `photos`. Si falta, se usa la primera. */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsPublicMediaUrl()
  coverUrl?: string | null;
}
