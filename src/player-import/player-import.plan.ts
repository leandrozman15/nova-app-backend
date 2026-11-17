import { fold, type Discipline, type Division } from './player-import.rules';
import type { ImportRowDto } from './player-import.dto';

/** Ids del catálogo de deportes de la app (los mismos que usa el alta de disciplinas). */
const CATALOG: Array<{ id: string; name: string; emoji: string; aliases: string[] }> = [
  { id: 'football', name: 'Fútbol', emoji: '⚽', aliases: ['futbol', 'football', 'soccer', 'futbol infantil', 'baby futbol', 'futsal', 'futbol 5'] },
  { id: 'hockey', name: 'Hockey', emoji: '🏑', aliases: ['hockey', 'hockey cesped', 'hockey sobre cesped'] },
  { id: 'rugby', name: 'Rugby', emoji: '🏉', aliases: ['rugby'] },
  { id: 'basketball', name: 'Básquet', emoji: '🏀', aliases: ['basquet', 'basket', 'basketball', 'basquetbol', 'baloncesto'] },
  { id: 'volleyball', name: 'Vóley', emoji: '🏐', aliases: ['voley', 'volley', 'voleibol', 'volleyball'] },
  { id: 'handball', name: 'Handball', emoji: '🤾', aliases: ['handball', 'handbol', 'balonmano'] },
  { id: 'tennis', name: 'Tenis', emoji: '🎾', aliases: ['tenis', 'tennis'] },
  { id: 'padel', name: 'Pádel', emoji: '🎾', aliases: ['padel', 'paddle'] },
  { id: 'swimming', name: 'Natación', emoji: '🏊', aliases: ['natacion', 'swimming'] },
  { id: 'athletics', name: 'Atletismo', emoji: '🏃', aliases: ['atletismo', 'athletics'] },
  { id: 'skating', name: 'Patín', emoji: '⛸️', aliases: ['patin', 'patinaje', 'patin artistico', 'skating'] },
  { id: 'gymnastics', name: 'Gimnasia', emoji: '🤸', aliases: ['gimnasia', 'gimnasia artistica', 'gymnastics'] },
  { id: 'martial_arts', name: 'Artes marciales', emoji: '🥋', aliases: ['artes marciales', 'karate', 'taekwondo', 'judo'] },
  { id: 'boxeo', name: 'Boxeo', emoji: '🥊', aliases: ['boxeo', 'box', 'boxing'] },
  { id: 'yoga', name: 'Yoga', emoji: '🧘', aliases: ['yoga'] },
];

/** "Tiro con arco" → "tiro_con_arco" (mismo criterio que la app). */
export function sportSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function sportFor(text: string): { sportId: string; name: string; emoji: string } {
  const key = fold(text);
  const known = CATALOG.find((s) => s.aliases.includes(key) || fold(s.name) === key || s.id === key);
  if (known) return { sportId: known.id, name: known.name, emoji: known.emoji };
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, 60);
  return { sportId: sportSlug(clean), name: clean.charAt(0).toLocaleUpperCase('es') + clean.slice(1), emoji: '🎽' };
}

export type NewDiscipline = { sportId: string; name: string; emoji: string };
export type NewDivision = { sport: string; sportName: string; name: string; branch: string | null; players: number };

const branchKey = (v: unknown) => {
  const b = fold(String(v ?? ''));
  return ['masculino', 'm', 'masc'].includes(b) ? 'masculino' : ['femenino', 'f', 'fem'].includes(b) ? 'femenino' : ['mixto', 'mixta'].includes(b) ? 'mixto' : null;
};

/**
 * Disciplinas y categorías que la planilla usa y el club no tiene.
 * Una categoría se crea dentro de su deporte; si todas sus filas tienen la misma rama, la toma.
 */
export function planMissing(rows: ImportRowDto[], disciplines: Discipline[], divisions: Division[]) {
  const newDisciplines = new Map<string, NewDiscipline>();
  const newDivisions = new Map<string, NewDivision & { branches: Set<string | null> }>();

  const resolveSport = (text: string) => {
    const existing = disciplines.find((d) => fold(d.sportId) === fold(text) || fold(d.name) === fold(text));
    if (existing) return { sportId: existing.sportId, name: existing.name, isNew: false };
    const s = sportFor(text);
    const sameId = disciplines.find((d) => d.sportId === s.sportId);
    if (sameId) return { sportId: sameId.sportId, name: sameId.name, isNew: false };
    return { ...s, isNew: true };
  };

  for (const row of rows) {
    const sportText = String(row.sport ?? '').trim();
    if (!sportText) continue;
    const sport = resolveSport(sportText);
    if (sport.isNew && !newDisciplines.has(sport.sportId))
      newDisciplines.set(sport.sportId, { sportId: sport.sportId, name: sport.name, emoji: (sport as NewDiscipline).emoji ?? '🎽' });

    const catText = String(row.category ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!catText) continue;
    const exists = divisions.some(
      (d) => fold(d.name) === fold(catText) && (!d.sport || fold(d.sport) === fold(sport.sportId)),
    );
    if (exists) continue;
    const key = `${sport.sportId}|${fold(catText)}`;
    const entry = newDivisions.get(key) ?? { sport: sport.sportId, sportName: sport.name, name: catText, branch: null, players: 0, branches: new Set() };
    entry.players += 1;
    entry.branches.add(branchKey(row.branch));
    newDivisions.set(key, entry);
  }

  return {
    disciplines: [...newDisciplines.values()],
    divisions: [...newDivisions.values()].map(({ branches, ...d }) => ({
      ...d,
      branch: branches.size === 1 ? [...branches][0] : null,
    })),
  };
}

/** Lista del club más lo que se va a crear (para revisar la planilla antes de implantar). */
export function withPlanned(disciplines: Discipline[], divisions: Division[], plan: ReturnType<typeof planMissing>) {
  return {
    disciplines: [...disciplines, ...plan.disciplines.map((d) => ({ sportId: d.sportId, name: d.name }))],
    divisions: [...divisions, ...plan.divisions.map((d, i) => ({ id: `nueva-${i}`, name: d.name, sport: d.sport }))],
  };
}
