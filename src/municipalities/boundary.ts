export type BoundaryPoint = [number, number];

/** Valida un contorno [lat, lng][]: 3 a 500 puntos, dentro de rangos válidos. Devuelve null si no es válido. */
export function parseBoundary(value: unknown): BoundaryPoint[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 500) return null;
  const out: BoundaryPoint[] = [];
  for (const p of value) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [lat, lng] = p;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    out.push([lat, lng]);
  }
  return out;
}
