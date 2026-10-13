/** Rubros de la tienda (mismo catálogo en el front: src/lib/store-categories.ts). */
export const STORE_CATEGORIES = [
  { id: 'indumentaria', label: 'Indumentaria' },
  { id: 'calzado', label: 'Calzado' },
  { id: 'equipamiento', label: 'Equipamiento' },
  { id: 'accesorios', label: 'Accesorios' },
  { id: 'nutricion', label: 'Nutrición y suplementos' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'salud', label: 'Salud y recuperación' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'otros', label: 'Otros' },
] as const;

export const STORE_CATEGORY_IDS = STORE_CATEGORIES.map((item) => item.id);

export const IVA_CONDITIONS = [
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTO',
  'EXENTO',
  'CONSUMIDOR_FINAL',
] as const;

/** CUIT válido: 11 dígitos con dígito verificador correcto. */
export function isValidCuit(raw: string) {
  const cuit = raw.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cuit)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce(
    (acc, weight, index) => acc + weight * Number(cuit[index]),
    0,
  );
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === Number(cuit[10]);
}

export const normalizeCuit = (raw: string) => raw.replace(/\D/g, '');
