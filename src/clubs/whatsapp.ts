/**
 * WhatsApp del club: el número se guarda como lo pide wa.me (solo dígitos, con país).
 * Argentina: 54 + 9 + código de área sin 0 + número sin 15 (11 3046-4848 → 5491130464848).
 */

/** Normaliza lo que escribe el club. null si no se puede armar un número válido. */
export function normalizeWhatsapp(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const international = raw.startsWith('+') || raw.startsWith('00');
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);

  if (international && !d.startsWith('54'))
    return d.length >= 8 && d.length <= 15 ? d : null;

  if (d.startsWith('54')) {
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);
  // Celular con "15" después del código de área (2, 3 o 4 dígitos): 11 15 3046-4848.
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') {
        d = d.slice(0, area) + d.slice(area + 2);
        break;
      }
    }
  }
  return d.length === 10 ? `549${d}` : null;
}

/** Cómo se muestra: "11 3046-4848" para Argentina, "+<número>" para el resto. */
export function displayWhatsapp(
  number: string | null | undefined,
): string | null {
  if (!number) return null;
  if (number.startsWith('549') && number.length === 13) {
    const n = number.slice(3);
    if (n.startsWith('11')) return `11 ${n.slice(2, 6)}-${n.slice(6)}`;
    return `${n.slice(0, 3)} ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  return `+${number}`;
}

/** Link para abrir el chat con un mensaje ya escrito. */
export const whatsappLink = (number: string, text?: string) =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
