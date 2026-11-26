import type { PrismaService } from '../prisma/prisma.service';

/**
 * Plantel (entrenador, horarios) de cada jugador. Los documentos del club no los puede leer el padre ni el
 * propio atleta desde la consola, por eso se los entrega el servidor. Si la ficha no trae equipo y la rama
 * tiene uno solo, se usa ese.
 */
export async function loadChildTeams(
  prisma: Pick<PrismaService, 'storeDocument'>,
  children: Array<{
    id: string;
    companyId: string;
    clubId: string;
    divisionId: string | null;
    extra: unknown;
  }>,
) {
  const result = new Map<string, Record<string, unknown>>();
  const wantedPaths = new Set<string>();
  const wantedParents = new Set<string>();
  const pathOf = new Map<string, string>();
  for (const c of children) {
    const extra = (c.extra ?? {}) as Record<string, unknown>;
    const divisionId =
      c.divisionId ??
      (typeof extra.divisionId === 'string' ? extra.divisionId : null);
    if (!c.clubId || !divisionId) continue;
    const teamId = typeof extra.teamId === 'string' ? extra.teamId : '';
    const base = `clubs/${c.clubId}/divisions/${divisionId}/teams`;
    // Se trae toda la categoría (todos sus planteles) para poder mostrar a todos sus entrenadores.
    wantedParents.add(base);
    pathOf.set(
      c.id,
      teamId && teamId !== divisionId ? `${base}/${teamId}` : base,
    );
  }
  if (pathOf.size === 0) return result;
  const rows = await prisma.storeDocument.findMany({
    where: {
      OR: [
        ...(wantedPaths.size ? [{ path: { in: [...wantedPaths] } }] : []),
        ...(wantedParents.size
          ? [{ parentPath: { in: [...wantedParents] } }]
          : []),
      ],
    },
    select: {
      path: true,
      parentPath: true,
      docId: true,
      companyId: true,
      data: true,
    },
  });
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const shape = (row: { docId: string; data: unknown }) => {
    const d = (row.data ?? {}) as Record<string, unknown>;
    return {
      id: row.docId,
      name: str(d.name) || null,
      season: str(d.season) || null,
      coachName: str(d.coachName) || null,
      assistantCoachName: str(d.assistantCoachName) || null,
      trainingDays: Array.isArray(d.trainingDays)
        ? d.trainingDays.filter((x): x is string => typeof x === 'string')
        : [],
      trainingStartTime: str(d.trainingStartTime) || null,
      trainingEndTime: str(d.trainingEndTime) || null,
      trainingSchedule: Array.isArray(d.trainingSchedule)
        ? d.trainingSchedule
            .map((x) => (x ?? {}) as Record<string, unknown>)
            .filter((x) => str(x.day) && str(x.start))
            .map((x) => ({
              day: str(x.day),
              start: str(x.start),
              end: str(x.end) || null,
              ...(str(x.name) ? { name: str(x.name) } : {}),
            }))
        : [],
      mainVenue: str(d.mainVenue) || null,
    };
  };
  const coachesOf = (rows: Array<{ data: unknown }>) => {
    const names: string[] = [];
    for (const r of rows) {
      const d = (r.data ?? {}) as Record<string, unknown>;
      for (const n of [str(d.coachName), str(d.assistantCoachName)]) {
        const clean = n.trim();
        if (
          clean &&
          !names.some((x) => x.toLowerCase() === clean.toLowerCase())
        )
          names.push(clean);
      }
    }
    return names;
  };
  for (const c of children) {
    const key = pathOf.get(c.id);
    if (!key) continue;
    const own = (r: { companyId: string | null }) =>
      !r.companyId || r.companyId === c.companyId;
    const exact = rows.find((r) => r.path === key && own(r));
    const base = key.includes('/teams/')
      ? key.slice(0, key.lastIndexOf('/'))
      : key;
    const category = rows.filter((r) => r.parentPath === base && own(r));
    // Los del plantel del atleta primero, después los de los demás planteles de su categoría.
    const ordered = exact
      ? [exact, ...category.filter((r) => r !== exact)]
      : category;
    const coaches = coachesOf(ordered);
    if (exact) {
      result.set(c.id, { ...shape(exact), coaches });
      continue;
    }
    if (category.length === 1)
      result.set(c.id, { ...shape(category[0]), coaches });
  }
  return result;
}
