/**
 * Dibuja el estado de turnos libres (1080×1920, formato historia) como SVG y lo pasa a JPEG.
 * Tipografías de la app (Bricolage Grotesque y Geist) incluidas en assets/fonts.
 */
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import * as jpeg from 'jpeg-js';

import type { ActivityStoryData } from './activity-story';
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

const P = 72; // margen lateral
// Zonas seguras de historias: arriba y abajo la app superpone su interfaz.
const T = 190;
const BOTTOM_LIMIT = STORY_H - 420;
const FOOT_Y = STORY_H - 390;

/** Fondo (portada oscurecida o degradé), encabezado del club y pie con el llamado. */
function frame(o: { clubName: string; logo?: string | null; cover?: string | null; kicker: string; footTitle: string; footText: string }) {
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
  const head: string[] = [];
  head.push(`<rect width="${STORY_W}" height="${STORY_H}" fill="url(#brand)"/>`);
  if (o.cover) head.push(`<image href="${o.cover}" x="0" y="0" width="${STORY_W}" height="${STORY_H}" preserveAspectRatio="xMidYMid slice"/>`);
  head.push(`<rect width="${STORY_W}" height="${STORY_H}" fill="url(#shade)"/>`);
  head.push(`<circle cx="${P + 64}" cy="${T + 64}" r="64" fill="#ffffff"/>`);
  if (o.logo) head.push(`<image href="${o.logo}" x="${P + 10}" y="${T + 10}" width="108" height="108" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid meet"/>`);
  else head.push(`<text x="${P + 64}" y="${T + 84}" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="56" fill="#0b6b45">${esc(o.clubName.charAt(0).toUpperCase())}</text>`);
  head.push(`<text x="${P + 152}" y="${T + 76}" font-family="Geist" font-weight="700" font-size="38" fill="#ffffff">${esc(fit(o.clubName, 38, STORY_W - P * 2 - 152))}</text>`);
  head.push(`<text x="${P + 152}" y="${T + 120}" font-family="Geist" font-weight="500" font-size="28" fill="#a7f3d0">${esc(fit(o.kicker, 28, STORY_W - P * 2 - 152))}</text>`);
  const foot = [
    `<rect x="${P}" y="${FOOT_Y}" width="${STORY_W - P * 2}" height="128" rx="32" fill="#ffffff"/>`,
    `<text x="${STORY_W / 2}" y="${FOOT_Y + 56}" text-anchor="middle" font-family="Geist" font-weight="700" font-size="36" fill="#04261a">${esc(o.footTitle)}</text>`,
    `<text x="${STORY_W / 2}" y="${FOOT_Y + 98}" text-anchor="middle" font-family="Geist" font-weight="500" font-size="30" fill="#0b6b45">${esc(fit(o.footText, 30, STORY_W - P * 2 - 48))}</text>`,
  ];
  return { defs, head, foot };
}

const svgDoc = (defs: string, parts: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${STORY_W}" height="${STORY_H}" viewBox="0 0 ${STORY_W} ${STORY_H}"><defs>${defs}</defs>${parts.join('')}</svg>`;

/** Corta un texto en renglones que entren en el ancho dado. */
export function wrap(text: string, size: number, max: number, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (textWidth(next, size) <= max || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, size, max);
    return kept;
  }
  return lines.map((l) => fit(l, size, max));
}

export function renderStorySvg(data: StoryData) {
  const f = frame({ clubName: data.clubName, logo: data.logo, cover: data.cover, kicker: 'Alquiler de canchas', footTitle: 'Reservá tu turno', footText: data.contact || 'Escribinos por mensaje privado' });
  const parts = [...f.head];
  parts.push(`<text x="${P}" y="${T + 270}" font-family="Bricolage Grotesque" font-weight="800" font-size="120" fill="#ffffff" letter-spacing="-3">Turnos</text>`);
  parts.push(`<text x="${P}" y="${T + 388}" font-family="Bricolage Grotesque" font-weight="800" font-size="120" fill="#4ade80" letter-spacing="-3">libres</text>`);
  // Días: se prueba con letra grande y, si no entra, se achica antes de cortar.
  const top = T + 450;
  let body = layoutDays(data, top, BOTTOM_LIMIT, 1);
  for (const k of [0.86, 0.74, 0.64]) {
    if (!body.truncated) break;
    body = layoutDays(data, top, BOTTOM_LIMIT, k);
  }
  parts.push(...body.parts);
  if (body.truncated) parts.push(`<text x="${P}" y="${BOTTOM_LIMIT + 4}" font-family="Geist" font-weight="500" font-size="28" fill="#cbd5e1">…y más horarios. Consultanos.</text>`);
  parts.push(...f.foot);
  return svgDoc(f.defs, parts);
}

/** Grupos de una actividad (categorías) con sus horarios y profes; `k` escala. */
function layoutGroups(data: ActivityStoryData, top: number, limit: number, k: number) {
  const parts: string[] = [];
  let y = top;
  let truncated = false;
  const W = STORY_W - P * 2;
  for (const g of data.groups) {
    const lineH = Math.round(50 * k);
    const blockH = (g.name ? Math.round(56 * k) : 0) + g.lines.length * lineH + (g.coaches.length ? Math.round(46 * k) : 0) + Math.round(48 * k);
    if (y + blockH > limit) { truncated = true; break; }
    parts.push(`<rect x="${P}" y="${y}" width="${W}" height="${blockH - Math.round(18 * k)}" rx="28" fill="#ffffff" fill-opacity="0.1"/>`);
    let yy = y + Math.round(16 * k);
    if (g.name) {
      parts.push(`<text x="${P + 28}" y="${yy + Math.round(36 * k)}" font-family="Geist" font-weight="700" font-size="${Math.round(36 * k)}" fill="#4ade80">${esc(fit(g.name, Math.round(36 * k), W - 56))}</text>`);
      yy += Math.round(56 * k);
    }
    for (const line of g.lines) {
      parts.push(`<text x="${P + 28}" y="${yy + Math.round(36 * k)}" font-family="Geist" font-weight="700" font-size="${Math.round(38 * k)}" fill="#ffffff">${esc(fit(line, Math.round(38 * k), W - 56))}</text>`);
      yy += lineH;
    }
    if (g.coaches.length) {
      parts.push(`<text x="${P + 28}" y="${yy + Math.round(32 * k)}" font-family="Geist" font-weight="500" font-size="${Math.round(30 * k)}" fill="#cbd5e1">${esc(fit(`${g.coaches.length > 1 ? 'Profes' : 'Profe'}: ${g.coaches.join(', ')}`, Math.round(30 * k), W - 56))}</text>`);
    }
    y += blockH;
  }
  return { parts, truncated, end: y };
}

export function renderActivityStorySvg(data: ActivityStoryData) {
  const f = frame({ clubName: data.clubName, logo: data.logo, cover: data.cover, kicker: data.audience || 'Escuelas y actividades', footTitle: 'Inscribite', footText: data.contact || 'Escribinos por mensaje privado' });
  const parts = [...f.head];
  const W = STORY_W - P * 2;
  let y = T + 200;
  if (data.highlight) {
    const size = 34;
    const w = Math.min(W, Math.ceil(textWidth(data.highlight, size) + 64));
    parts.push(`<rect x="${P}" y="${y}" width="${w}" height="68" rx="34" fill="#facc15"/>`);
    parts.push(`<text x="${P + w / 2}" y="${y + 46}" text-anchor="middle" font-family="Geist" font-weight="700" font-size="${size}" fill="#1c1917">${esc(fit(data.highlight, size, W - 64))}</text>`);
    y += 100;
  }
  const titleSize = textWidth(data.title, 120) > W * 1.6 ? 92 : 120;
  const titleLines = wrap(data.title, titleSize, W, 2);
  for (const line of titleLines) {
    y += Math.round(titleSize * 0.95);
    parts.push(`<text x="${P}" y="${y}" font-family="Bricolage Grotesque" font-weight="800" font-size="${titleSize}" fill="#ffffff" letter-spacing="-3">${esc(line)}</text>`);
  }
  y += 40;
  if (data.price) {
    parts.push(`<text x="${P}" y="${y + 40}" font-family="Geist" font-weight="700" font-size="40" fill="#4ade80">${esc(fit(data.price, 40, W))}</text>`);
    y += 80;
  }
  let body = layoutGroups(data, y, BOTTOM_LIMIT, 1);
  for (const k of [0.88, 0.76, 0.66]) {
    if (!body.truncated) break;
    body = layoutGroups(data, y, BOTTOM_LIMIT, k);
  }
  parts.push(...body.parts);
  if (body.truncated) parts.push(`<text x="${P}" y="${BOTTOM_LIMIT + 4}" font-family="Geist" font-weight="500" font-size="28" fill="#cbd5e1">…y más horarios. Consultanos.</text>`);
  parts.push(...f.foot);
  return svgDoc(f.defs, parts);
}

/** SVG → JPEG (Instagram pide JPEG para las historias con imagen). */
export function svgToJpeg(svg: string, quality = 88): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: STORY_W },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Geist' },
    background: '#04261a',
  });
  const img = resvg.render();
  const encoded = jpeg.encode({ data: Buffer.from(img.pixels), width: img.width, height: img.height }, quality);
  return Buffer.from(encoded.data);
}

export const renderStoryJpeg = (data: StoryData, quality = 88) => svgToJpeg(renderStorySvg(data), quality);
export const renderActivityStoryJpeg = (data: ActivityStoryData, quality = 88) => svgToJpeg(renderActivityStorySvg(data), quality);
