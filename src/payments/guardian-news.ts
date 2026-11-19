import type { PrismaService } from '../prisma/prisma.service';

type Doc = Record<string, unknown>;

/** Lo que el padre/tutor necesita saber de cada hijo para filtrar novedades. */
export type NewsChild = {
  companyId: string;
  clubId: string;
  clubName: string | null;
  sport: string | null;
  divisionId: string | null;
  teamId: string | null;
};

/** Destinatarios que incluyen a las familias: las novedades para atletas son también para sus padres. */
export const GUARDIAN_SEGMENTS = ['families', 'athletes'];

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v)) : [];
const meets = (targets: string[], mine: string[]) =>
  targets.length === 0 || targets.some((t) => mine.includes(t));

/** ¿Esta novedad le llega a la familia de alguno de estos hijos del club? (mismo criterio que la app). */
export function visibleToGuardian(
  event: Doc,
  children: NewsChild[],
  now = Date.now(),
): boolean {
  const expiresAt =
    typeof event.expiresAt === 'string' ? Date.parse(event.expiresAt) : NaN;
  if (!Number.isNaN(expiresAt) && expiresAt <= now) return false;
  const targets = (event.targets ?? null) as Doc | null;
  if (!targets || typeof targets !== 'object') return true;
  const segments = list(targets.segments);
  const clubId = typeof event.clubId === 'string' ? event.clubId : null;
  const disciplines = list(targets.disciplineIds).map((d) =>
    disciplineKey(d, clubId),
  );
  const divisions = list(targets.divisionIds);
  if (!meets(segments, GUARDIAN_SEGMENTS)) return false;
  return children.some(
    (c) =>
      meets(disciplines, c.sport ? [c.sport] : []) &&
      meets(
        divisions,
        [c.divisionId, c.teamId].filter((v): v is string => !!v),
      ),
  );
}

/** La consola guarda la disciplina como "<clubId>_football"; el hijo trae el deporte ("football"). */
export function disciplineKey(value: string, clubId: string | null): string {
  return clubId && value.startsWith(`${clubId}_`)
    ? value.slice(clubId.length + 1)
    : value;
}

const createdAtOf = (doc: Doc) =>
  typeof doc.createdAt === 'string' ? doc.createdAt : '';

/** Novedades vigentes de los clubes de mis hijos, de la más nueva a la más vieja. */
export async function loadGuardianNews(
  prisma: Pick<PrismaService, 'storeDocument'>,
  children: NewsChild[],
  limit = 30,
) {
  const byClub = new Map<string, NewsChild[]>();
  for (const c of children)
    byClub.set(c.clubId, [...(byClub.get(c.clubId) ?? []), c]);
  const perClub = await Promise.all(
    [...byClub.entries()].map(async ([clubId, kids]) => {
      const rows = await prisma.storeDocument.findMany({
        where: {
          companyId: kids[0].companyId,
          parentPath: `clubs/${clubId}/special_events`,
        },
        select: { docId: true, data: true },
      });
      return rows
        .map((r) => ({
          ...((r.data ?? {}) as Doc),
          id: r.docId,
          clubId,
          clubName: kids[0].clubName,
        }))
        .filter((e) => visibleToGuardian(e, kids));
    }),
  );
  return perClub
    .flat()
    .sort((a, b) => createdAtOf(b).localeCompare(createdAtOf(a)))
    .slice(0, limit);
}
