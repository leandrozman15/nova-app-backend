/** Email del padre/madre/tutor cargado en la ficha del atleta (en minúsculas), o null. */
export function guardianEmailOf(extra: unknown): string | null {
  const value = (extra as Record<string, unknown> | null)?.guardianEmail;
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

/** ¿Tiene 18 años o más? Sin fecha de nacimiento se lo trata como menor (lo prudente). */
export function isAdult(
  birthDate: Date | string | null | undefined,
  now = new Date(),
) {
  if (!birthDate) return false;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return false;
  const adultOn = new Date(born);
  adultOn.setUTCFullYear(adultOn.getUTCFullYear() + 18);
  return adultOn.getTime() <= now.getTime();
}
