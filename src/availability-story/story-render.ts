/**
 * Dibuja el estado de turnos libres (1080×1920, formato historia) como SVG y lo pasa a JPEG.
 * Tipografías de la app (Bricolage Grotesque y Geist) incluidas en assets/fonts.
 */
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import * as jpeg from 'jpeg-js';

import { rangeLabel, type StoryData } from './story-rules';

export const STORY_W = 1080;
export const STORY_H = 1920;

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const FONTS = ['BricolageGrotesque_800ExtraBold.ttf', 'Geist_500Medium.ttf', 'Geist_700Bold.ttf'].map((f) => join(FONT_DIR, f));

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Ancho aproximado de un texto (Geist/Bricolage): sirve para acomodar los rangos en filas. */
export function textWidth(text: string, size: number) {
  let units = 0;
  for (const ch of text) units += /[0-9]/.test(ch) ? 0.6 : ch === ' ' ? 0.28 : /[:.]/.test(ch) ? 0.3 : /[A-ZÁÉÍÓÚÑ]/.test(ch) ? 0.68 : 0.55;
  return units * size;
}

/** Recorta con "…" para que entre en el ancho dado. */
export function fit(text: string, size: number, max: number) {
  if (textWidth(text, size) <= max) return text;
  let out = text;
  while (out.length > 1 && textWidth(`${out}…`, size) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

/** Acomoda los días y sus rangos desde `top`; `k` escala tamaños. Corta si pasa `limit`. */
function layoutDays(data: StoryData, top: number, limit: number, k: number) {
  const P = 72;
  const parts: string[] = [];
  let y = top;
  let truncated = false;
  const size = Math.round(36 * k);
  const h = Math.round(64 * k);
  const gap = Math.round(14 * k);
  const dayH = Math.round(64 * k);
  outer: for (const day of data.days) {
    if (y + dayH + 60 > limit) { truncated = true; break; }
    parts.push(`<rect x="${P}" y="${y}" width="${STORY_W - P * 2}" height="${dayH}" rx="18" fill="#ffffff" fill-opacity="0.12"/>`);
    parts.push(`<text x="${P + 28}" y="${y + dayH * 0.69}" font-family="Geist" font-weight="700" font-size="${Math.round(34 * k)}" fill="#ffffff">${esc(day.title)}</text>`);
    y += dayH + Math.round(36 * k);
    const withFree = day.facilities.filter((f) => f.ranges.length > 0);
    if (withFree.length === 0) {
      parts.push(`<text x="${P + 8}" y="${y + 20}" font-family="Geist" font-weight="500" font-size="${Math.round(32 * k)}" fill="#cbd5e1">Sin turnos libres: ¡agenda completa!</text>`);
      y += Math.round(80 * k);
      continue;
    }
    for (const f of withFree) {
      // Alto de la cancha: nombre + filas de pastillas.
      const widths = f.ranges.map((r) => Math.ceil(textWidth(rangeLabel(r), size) + 48 * k));
      let rows = 1;
      let x = P;
      for (const w of widths) { if (x + w > STORY_W - P) { rows++; x = P; } x += w + gap; }
      const blockH = Math.round(40 * k) + rows * h + (rows - 1) * gap;
      if (y + blockH > limit) { truncated = true; break outer; }
      parts.push(`<text x="${P + 8}" y="${y + Math.round(18 * k)}" font-family="Geist" font-weight="700" font-size="${Math.round(32 * k)}" fill="#e2e8f0">${esc(fit(f.name, Math.round(32 * k), STORY_W - P * 2 - 16))}</text>`);
      y += Math.round(40 * k);
      x = P;
      f.ranges.forEach((r, i) => {
        const w = widths[i];
        if (x + w > STORY_W - P) { x = P; y += h + gap; }
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#22c55e"/>`);
        parts.push(`<text x="${x + w / 2}" y="${y + h * 0.7}" text-anchor="middle" font-family="Geist" font-weight="700" font-size="${size}" fill="#04261a">${esc(rangeLabel(r))}</text>`);
        x += w + gap;
      });
      y += h + Math.round(30 * k);
    }
    y += Math.round(14 * k);
  }
  return { parts, truncated, end: y };
}

export function renderStorySvg(data: StoryData) {
  const P = 72; // margen lateral
  // Zonas seguras de historias: arriba y abajo la app superpone su interfaz.
  const T = 190;
  const parts: string[] = [];
  const defs = `
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#03140d" stop-opacity="0.55"/>
      <stop offset="0.35" stop-color="#03140d" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#020b07" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b6b45"/>
      <stop offset="1" stop-color="#04261a"/>
    </linearGradient>
    <clipPath id="logoClip"><circle cx="${P + 64}" cy="${T + 64}" r="58"/></clipPath>`;

  // Fondo: portada del club oscurecida, o el degradé de la marca.
  parts.push(`<rect width="${STORY_W}" height="${STORY_H}" fill="url(#brand)"/>`);
  if (data.cover) parts.push(`<image href="${data.cover}" x="0" y="0" width="${STORY_W}" height="${STORY_H}" preserveAspectRatio="xMidYMid slice"/>`);
  parts.push(`<rect width="${STORY_W}" height="${STORY_H}" fill="url(#shade)"/>`);

  // Encabezado
  parts.push(`<circle cx="${P + 64}" cy="${T + 64}" r="64" fill="#ffffff"/>`);
  if (data.logo) parts.push(`<image href="${data.logo}" x="${P + 10}" y="${T + 10}" width="108" height="108" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid meet"/>`);
  else parts.push(`<text x="${P + 64}" y="${T + 84}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="56" fill="#0b6b45">${esc(data.clubName.charAt(0).toUpperCase())}</text>`);
  parts.push(`<text x="${P + 152}" y="${T + 76}" font-family="Geist" font-weight="700" font-size="38" fill="#ffffff">${esc(fit(data.clubName, 38, STORY_W - P * 2 - 152))}</text>`);
  parts.push(`<text x="${P + 152}" y="${T + 120}" font-family="Geist" font-weight="500" font-size="28" fill="#a7f3d0">Alquiler de canchas</text>`);

  parts.push(`<text x="${P}" y="${T + 270}" font-family="Bricolage Grotesque" font-weight="800" font-size="120" fill="#ffffff" letter-spacing="-3">Turnos</text>`);
  parts.push(`<text x="${P}" y="${T + 388}" font-family="Bricolage Grotesque" font-weight="800" font-size="120" fill="#4ade80" letter-spacing="-3">libres</text>`);

  // Días: se prueba con letra grande y, si no entra, se achica antes de cortar.
  const top = T + 450;
  const bottomLimit = STORY_H - 420;
  let body = layoutDays(data, top, bottomLimit, 1);
  for (const k of [0.86, 0.74, 0.64]) {
    if (!body.truncated) break;
    body = layoutDays(data, top, bottomLimit, k);
  }
  parts.push(...body.parts);
  if (body.truncated) parts.push(`<text x="${P}" y="${bottomLimit + 4}" font-family="Geist" font-weight="500" font-size="28" fill="#cbd5e1">…y más horarios. Consultanos.</text>`);

  // Pie: cómo reservar
  const footY = STORY_H - 390;
  parts.push(`<rect x="${P}" y="${footY}" width="${STORY_W - P * 2}" height="128" rx="32" fill="#ffffff"/>`);
  parts.push(`<text x="${STORY_W / 2}" y="${footY + 56}" text-anchor="middle" font-family="Geist" font-weight="700" font-size="36" fill="#04261a">Reservá tu turno</text>`);
  parts.push(`<text x="${STORY_W / 2}" y="${footY + 98}" text-anchor="middle" font-family="Geist" font-weight="500" font-size="30" fill="#0b6b45">${esc(fit(data.contact || 'Escribinos por mensaje privado', 30, STORY_W - P * 2 - 48))}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${STORY_W}" height="${STORY_H}" viewBox="0 0 ${STORY_W} ${STORY_H}"><defs>${defs}</defs>${parts.join('')}</svg>`;
}

/** SVG → JPEG (Instagram pide JPEG para las historias con imagen). */
export function renderStoryJpeg(data: StoryData, quality = 88): Buffer {
  const svg = renderStorySvg(data);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: STORY_W },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Geist' },
    background: '#04261a',
  });
  const img = resvg.render();
  const encoded = jpeg.encode({ data: Buffer.from(img.pixels), width: img.width, height: img.height }, quality);
  return Buffer.from(encoded.data);
}
