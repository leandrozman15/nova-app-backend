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
    if (teamId && teamId !== divisionId) {
      wantedPaths.add(`${base}/${teamId}`);
      pathOf.set(c.id, `${base}/${teamId}`);
    } else {
      wantedParents.add(base);
      pathOf.set(c.id, base);
    }
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
    select: { path: true, parentPath: true, docId: true, companyId: true, data: true },
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
      mainVenue: str(d.mainVenue) || null,
    };
  };
  for (const c of children) {
    const key = pathOf.get(c.id);
    if (!key) continue;
    const own = (r: { companyId: string | null }) =>
      !r.companyId || r.companyId === c.companyId;
    const exact = rows.find((r) => r.path === key && own(r));
    if (exact) {
      result.set(c.id, shape(exact));
      continue;
    }
    const siblings = rows.filter((r) => r.parentPath === key && own(r));
    if (siblings.length === 1) result.set(c.id, shape(siblings[0]));
  }
  return result;
}
