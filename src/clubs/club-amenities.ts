/**
 * Servicios que un club puede mostrar en la app. Mismo contenido en front y back
 * (src/lib/club-amenities.ts ↔ src/clubs/club-amenities.ts).
 */
export const CLUB_AMENITIES = [
  { id: 'wifi', label: 'Wifi' },
  { id: 'vestuarios', label: 'Vestuarios' },
  { id: 'duchas', label: 'Duchas' },
  { id: 'banos', label: 'Baños' },
  { id: 'lockers', label: 'Lockers' },
  { id: 'estacionamiento', label: 'Estacionamiento' },
  { id: 'bicicletero', label: 'Bicicletero' },
  { id: 'buffet', label: 'Buffet / bar' },
  { id: 'parrilla', label: 'Parrillas / quincho' },
  { id: 'iluminacion', label: 'Iluminación nocturna' },
  { id: 'techado', label: 'Canchas techadas' },
  { id: 'climatizado', label: 'Climatización' },
  { id: 'alquiler_equipos', label: 'Alquiler de equipos' },
  { id: 'tienda', label: 'Tienda' },
  { id: 'kids', label: 'Espacio para chicos' },
  { id: 'dea', label: 'Desfibrilador (DEA)' },
  { id: 'enfermeria', label: 'Primeros auxilios' },
  { id: 'accesible', label: 'Accesible' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'pago_tarjeta', label: 'Pago con tarjeta' },
] as const;

export type ClubAmenity = (typeof CLUB_AMENITIES)[number]['id'];

export const CLUB_AMENITY_IDS: string[] = CLUB_AMENITIES.map(
  (amenity) => amenity.id,
);

/** Servicios que se cargan por instalación (formulario de canchas) → servicio del club. */
export const FACILITY_SERVICE_TO_AMENITY: Record<string, ClubAmenity> = {
  wifi: 'wifi',
  dea: 'dea',
  showers: 'duchas',
  toilets: 'banos',
  lockers: 'lockers',
  accessibility: 'accesible',
};

export function clubAmenityLabel(id: string) {
  return CLUB_AMENITIES.find((amenity) => amenity.id === id)?.label ?? null;
}
