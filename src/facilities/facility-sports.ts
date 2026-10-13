/**
 * Catálogo de deportes por cancha/espacio. Mismo contenido en front y back
 * (src/lib/facility-sports.ts ↔ src/facilities/facility-sports.ts).
 * `family` coincide con los deportes de club (football, padel, …) que usan los filtros.
 */
export const FACILITY_SPORT_FAMILIES = [
  { id: 'football', label: 'Fútbol' },
  { id: 'padel', label: 'Pádel' },
  { id: 'tennis', label: 'Tenis' },
  { id: 'beach_tennis', label: 'Beach tennis' },
  { id: 'squash', label: 'Squash' },
  { id: 'pickleball', label: 'Pickleball' },
  { id: 'table_tennis', label: 'Tenis de mesa' },
  { id: 'pelota_paleta', label: 'Pelota paleta' },
  { id: 'basketball', label: 'Básquet' },
  { id: 'volleyball', label: 'Vóley' },
  { id: 'handball', label: 'Handball' },
  { id: 'hockey', label: 'Hockey' },
  { id: 'rugby', label: 'Rugby' },
  { id: 'baseball', label: 'Béisbol y sóftbol' },
  { id: 'golf', label: 'Golf' },
  { id: 'swimming', label: 'Natación' },
  { id: 'athletics', label: 'Atletismo' },
  { id: 'skating', label: 'Patín' },
  { id: 'cycling', label: 'Ciclismo' },
  { id: 'gym', label: 'Gimnasio' },
  { id: 'gymnastics', label: 'Gimnasia' },
  { id: 'yoga', label: 'Yoga y pilates' },
  { id: 'martial_arts', label: 'Artes marciales' },
  { id: 'boxeo', label: 'Boxeo' },
  { id: 'fencing', label: 'Esgrima' },
  { id: 'bochas', label: 'Bochas' },
  { id: 'polo', label: 'Polo' },
  { id: 'multi', label: 'Multideporte' },
] as const;

export type FacilitySportFamily = (typeof FACILITY_SPORT_FAMILIES)[number]['id'];

export const FACILITY_SPORTS: ReadonlyArray<{ id: string; label: string; family: FacilitySportFamily }> = [
  { id: 'futbol_5', label: 'Fútbol 5', family: 'football' },
  { id: 'futbol_6', label: 'Fútbol 6', family: 'football' },
  { id: 'futbol_7', label: 'Fútbol 7', family: 'football' },
  { id: 'futbol_8', label: 'Fútbol 8', family: 'football' },
  { id: 'futbol_9', label: 'Fútbol 9', family: 'football' },
  { id: 'futbol_11', label: 'Fútbol 11', family: 'football' },
  { id: 'futsal', label: 'Futsal / fútbol de salón', family: 'football' },
  { id: 'futbol_playa', label: 'Fútbol playa', family: 'football' },
  { id: 'futevoley', label: 'Futevóley', family: 'football' },
  { id: 'padel', label: 'Pádel', family: 'padel' },
  { id: 'tenis', label: 'Tenis', family: 'tennis' },
  { id: 'beach_tennis', label: 'Beach tennis', family: 'beach_tennis' },
  { id: 'squash', label: 'Squash', family: 'squash' },
  { id: 'pickleball', label: 'Pickleball', family: 'pickleball' },
  { id: 'tenis_mesa', label: 'Tenis de mesa', family: 'table_tennis' },
  { id: 'pelota_paleta', label: 'Pelota paleta / frontón', family: 'pelota_paleta' },
  { id: 'basquet', label: 'Básquet', family: 'basketball' },
  { id: 'basquet_3x3', label: 'Básquet 3x3', family: 'basketball' },
  { id: 'voley', label: 'Vóley', family: 'volleyball' },
  { id: 'voley_playa', label: 'Beach vóley', family: 'volleyball' },
  { id: 'handball', label: 'Handball', family: 'handball' },
  { id: 'handball_playa', label: 'Beach handball', family: 'handball' },
  { id: 'hockey_cesped', label: 'Hockey sobre césped', family: 'hockey' },
  { id: 'hockey_pista', label: 'Hockey sobre patines', family: 'hockey' },
  { id: 'rugby', label: 'Rugby XV', family: 'rugby' },
  { id: 'rugby_7', label: 'Rugby 7', family: 'rugby' },
  { id: 'beisbol', label: 'Béisbol', family: 'baseball' },
  { id: 'softbol', label: 'Sóftbol', family: 'baseball' },
  { id: 'golf', label: 'Golf (cancha)', family: 'golf' },
  { id: 'golf_practica', label: 'Golf (práctica / driving range)', family: 'golf' },
  { id: 'pileta_25', label: 'Pileta 25 m', family: 'swimming' },
  { id: 'pileta_50', label: 'Pileta 50 m', family: 'swimming' },
  { id: 'waterpolo', label: 'Waterpolo', family: 'swimming' },
  { id: 'atletismo', label: 'Pista de atletismo', family: 'athletics' },
  { id: 'patin', label: 'Patín', family: 'skating' },
  { id: 'ciclismo', label: 'Ciclismo / velódromo', family: 'cycling' },
  { id: 'musculacion', label: 'Gimnasio / musculación', family: 'gym' },
  { id: 'funcional', label: 'Entrenamiento funcional / crossfit', family: 'gym' },
  { id: 'gimnasia', label: 'Gimnasia artística', family: 'gymnastics' },
  { id: 'yoga', label: 'Yoga / pilates', family: 'yoga' },
  { id: 'artes_marciales', label: 'Artes marciales / dojo', family: 'martial_arts' },
  { id: 'boxeo', label: 'Boxeo', family: 'boxeo' },
  { id: 'esgrima', label: 'Esgrima', family: 'fencing' },
  { id: 'bochas', label: 'Bochas', family: 'bochas' },
  { id: 'polo', label: 'Polo', family: 'polo' },
  { id: 'multideporte', label: 'Polideportivo / multideporte', family: 'multi' },
];

export const FACILITY_SPORT_IDS = FACILITY_SPORTS.map((sport) => sport.id);

export function facilitySportLabel(id: string | null | undefined) {
  return FACILITY_SPORTS.find((sport) => sport.id === id)?.label ?? null;
}

export function facilitySportFamily(id: string | null | undefined) {
  return FACILITY_SPORTS.find((sport) => sport.id === id)?.family ?? null;
}

/** Variantes de una familia ("football" → futbol_5, futbol_7, …). */
export function facilitySportsOf(family: string) {
  return FACILITY_SPORTS.filter((sport) => sport.family === family);
}
