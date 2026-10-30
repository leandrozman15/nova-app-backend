import type { PrismaService } from '../prisma/prisma.service';

type Doc = Record<string, unknown>;

export type GuardianTournament = Doc & {
  id: string;
  standings: Doc[];
  matches: Doc[];
};

/**
 * Torneos que arma la dirección en el Fixture del club (clubs/{clubId}/tournaments), con su tabla de
 * posiciones y todos sus partidos. El padre no puede leer el almacén, así que se los armamos acá.
 */
export async function loadClubCompetitions(
  prisma: Pick<PrismaService, 'storeDocument'>,
  companyId: string,
  clubId: string,
): Promise<GuardianTournament[]> {
  const base = `clubs/${clubId}/tournaments`;
  const docs = await prisma.storeDocument.findMany({
    where: {
      companyId,
      OR: [
        { parentPath: base },
        { parentPath: { startsWith: `${base}/` }, collection: { in: ['matches', 'standings'] } },
      ],
    },
    select: { parentPath: true, collection: true, docId: true, data: true },
  });

  const byId = new Map<string, GuardianTournament>();
  for (const row of docs) {
    if (row.parentPath === base) {
      byId.set(row.docId, { ...((row.data ?? {}) as Doc), id: row.docId, standings: [], matches: [] });
    }
  }
  for (const row of docs) {
    if (row.parentPath === base) continue;
    const tid = row.parentPath.slice(base.length + 1).split('/')[0];
    const t = byId.get(tid);
    if (!t) continue;
    const doc = { ...((row.data ?? {}) as Doc), id: row.docId };
    if (row.collection === 'standings') t.standings.push(doc);
    else if (row.collection === 'matches') t.matches.push(doc);
  }
  return [...byId.values()];
}
