const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia en km entre dos puntos (fórmula de Haversine). */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Caja delimitadora que contiene el círculo de `radiusKm` (prefiltro barato en SQL). */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const cosLat = Math.max(Math.cos(toRad(lat)), 0.01);
  const dLng = radiusKm / (111.32 * cosLat);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}
