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
/** Rama del club (Division): agrupa categorías, p. ej. "Fútbol infantil". */
export type NewDivision = { sport: string; sportName: string; name: string; branch: string | null; players: number };
/** Categoría (plantel) dentro de una rama, p. ej. "2013" dentro de "Fútbol infantil". */
export type NewTeam = { sport: string; sportName: string; divisionName: string; name: string; branch: string | null; players: number };
/** Categoría que ya existe en el club. */
export type ExistingTeam = { id: string; name: string; divisionId: string };

export const branchKey = (v: unknown) => {
  const b = fold(String(v ?? ''));
  return ['masculino', 'm', 'masc'].includes(b) ? 'masculino' : ['femenino', 'f', 'fem'].includes(b) ? 'femenino' : ['mixto', 'mixta'].includes(b) ? 'mixto' : null;
};

const genderBranch = (v: unknown) => {
  const g = fold(String(v ?? ''));
  return ['femenino', 'f', 'mujer'].includes(g) ? 'femenino' : ['masculino', 'm', 'varon', 'hombre'].includes(g) ? 'masculino' : 'mixto';
};

const clean = (v: unknown, max = 60) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** Rama por defecto cuando la planilla no la indica: deporte + rama ("Hockey femenino"). */
export const defaultDivisionName = (sportName: string, branch: string) => `${sportName} ${branch}`;

export type Placement = { sportId: string; sportName: string; divisionName: string; teamName: string | null; branch: string };

/**
 * Dónde va cada fila: disciplina → rama → categoría.
 * - "Rama del club" de la planilla, o deporte + rama (masculino/femenino/mixto).
 * - Compatibilidad: si la categoría coincide con una rama existente del deporte, va directo a esa rama.
 */
export function placementOf(
  row: ImportRowDto,
  sport: { sportId: string; name: string },
  divisions: Division[],
): Placement {
  const branch = branchKey(row.branch) ?? genderBranch(row.gender);
  const categoryText = clean(row.category);
  const divisionText = clean(row.division);
  const ofSport = divisions.filter((d) => !d.sport || fold(d.sport) === fold(sport.sportId));
  if (!divisionText && categoryText) {
    const legacy = ofSport.find((d) => fold(d.name) === fold(categoryText));
    if (legacy) return { sportId: sport.sportId, sportName: sport.name, divisionName: legacy.name, teamName: null, branch };
  }
  return {
    sportId: sport.sportId,
    sportName: sport.name,
    divisionName: divisionText || defaultDivisionName(sport.name, branch),
    teamName: categoryText || null,
    branch,
  };
}

/** Disciplinas, ramas y categorías que la planilla usa y el club no tiene. */
export function planMissing(rows: ImportRowDto[], disciplines: Discipline[], divisions: Division[], teams: ExistingTeam[] = []) {
  const newDisciplines = new Map<string, NewDiscipline>();
  const newDivisions = new Map<string, NewDivision & { branches: Set<string> }>();
  const newTeams = new Map<string, NewTeam & { branches: Set<string> }>();

  const resolveSport = (text: string) => {
    const existing = disciplines.find((d) => fold(d.sportId) === fold(text) || fold(d.name) === fold(text));
    if (existing) return { sportId: existing.sportId, name: existing.name, emoji: '', isNew: false };
    const s = sportFor(text);
    const sameId = disciplines.find((d) => d.sportId === s.sportId);
    if (sameId) return { sportId: sameId.sportId, name: sameId.name, emoji: '', isNew: false };
    return { ...s, isNew: true };
  };

  for (const row of rows) {
    const sportText = clean(row.sport);
    if (!sportText) continue;
    const sport = resolveSport(sportText);
    if (sport.isNew && !newDisciplines.has(sport.sportId))
      newDisciplines.set(sport.sportId, { sportId: sport.sportId, name: sport.name, emoji: sport.emoji || '🎽' });

    const place = placementOf(row, { sportId: sport.sportId, name: sport.name }, divisions);
    const division = divisions.find(
      (d) => fold(d.name) === fold(place.divisionName) && (!d.sport || fold(d.sport) === fold(sport.sportId)),
    );
    const dKey = `${sport.sportId}|${fold(place.divisionName)}`;
    if (!division) {
      const entry = newDivisions.get(dKey) ?? { sport: sport.sportId, sportName: sport.name, name: place.divisionName, branch: null, players: 0, branches: new Set<string>() };
      entry.players += 1;
      entry.branches.add(place.branch);
      newDivisions.set(dKey, entry);
    }
    if (!place.teamName) continue;
    const teamExists = division && teams.some((t) => t.divisionId === division.id && fold(t.name) === fold(place.teamName!));
    if (teamExists) continue;
    const tKey = `${dKey}|${fold(place.teamName)}`;
    const team = newTeams.get(tKey) ?? { sport: sport.sportId, sportName: sport.name, divisionName: division?.name ?? place.divisionName, name: place.teamName, branch: null, players: 0, branches: new Set<string>() };
    team.players += 1;
    team.branches.add(place.branch);
    newTeams.set(tKey, team);
  }

  const one = (b: Set<string>) => (b.size === 1 ? [...b][0] : 'mixto');
  return {
    disciplines: [...newDisciplines.values()],
    divisions: [...newDivisions.values()].map(({ branches, ...d }) => ({ ...d, branch: one(branches) })),
    teams: [...newTeams.values()].map(({ branches, ...t }) => ({ ...t, branch: one(branches) })),
  };
}

/** Lista del club más lo que se va a crear (para revisar la planilla antes de implantar). */
export function withPlanned(
  disciplines: Discipline[],
  divisions: Division[],
  teams: ExistingTeam[],
  plan: ReturnType<typeof planMissing>,
) {
  const allDivisions = [...divisions, ...plan.divisions.map((d, i) => ({ id: `nueva-rama-${i}`, name: d.name, sport: d.sport }))];
  const findDivision = (sport: string, name: string) =>
    allDivisions.find((d) => fold(d.name) === fold(name) && (!d.sport || fold(d.sport) === fold(sport)));
  return {
    disciplines: [...disciplines, ...plan.disciplines.map((d) => ({ sportId: d.sportId, name: d.name }))],
    divisions: allDivisions,
    teams: [
      ...teams,
      ...plan.teams.map((t, i) => ({ id: `nueva-categoria-${i}`, name: t.name, divisionId: findDivision(t.sport, t.divisionName)?.id ?? '' })),
    ],
  };
}

/** Rama de plantel en el formato del formulario de la app. */
export const teamRama = (branch: string | null) => (branch === 'femenino' ? 'female' : branch === 'masculino' ? 'male' : 'both');
