import type { PrismaService } from '../prisma/prisma.service';

/**
 * La foto de una persona puede estar en varios lados: la cargó el club en el
 * legajo de staff (users/{uid}), la subió ella misma a su ficha del padrón
 * (Player) o la puso en su perfil de profe (CoachProfile). Acá se junta todo.
 */

type Db = Pick<
  PrismaService,
  'storeDocument' | 'player' | 'coachProfile' | 'user'
>;

const ok = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Foto por uid de Firebase: legajo de staff, ficha del padrón o perfil de profe. */
async function photosByUidRaw(
  db: Db,
  uids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const list = [...new Set(uids.filter(ok))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  const [staff, players, coaches] = await Promise.all([
    db.storeDocument.findMany({
      where: { path: { in: list.map((u) => `users/${u}`) } },
      select: { docId: true, data: true },
    }),
    db.player.findMany({
      where: {
        photoUrl: { not: null },
        OR: [
          { authUid: { in: list } },
          { legacyId: { in: list } },
          { id: { in: list } },
        ],
      },
      select: { id: true, authUid: true, legacyId: true, photoUrl: true },
      orderBy: { updatedAt: 'desc' },
    }),
    db.coachProfile.findMany({
      where: { photoUrl: { not: null }, user: { firebaseUid: { in: list } } },
      select: { photoUrl: true, user: { select: { firebaseUid: true } } },
    }),
  ]);
  const set = (uid: string | null | undefined, photo: unknown) => {
    if (ok(uid) && ok(photo) && list.includes(uid) && !out.has(uid))
      out.set(uid, photo);
  };
  for (const s of staff)
    set(s.docId, (s.data as { photoUrl?: unknown } | null)?.photoUrl);
  for (const p of players) {
    set(p.authUid, p.photoUrl);
    set(p.legacyId, p.photoUrl);
    set(p.id, p.photoUrl);
  }
  for (const c of coaches) set(c.user.firebaseUid, c.photoUrl);
  return out;
}

/** Foto de alumnos de un profe: su ficha del padrón o su cuenta. */
async function studentPhotosRaw(
  db: Db,
  students: { id: string; playerId?: string | null; userId?: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const playerIds = [
    ...new Set(students.map((s) => s.playerId).filter(ok)),
  ];
  const userIds = [...new Set(students.map((s) => s.userId).filter(ok))];
  const [players, users] = await Promise.all([
    playerIds.length
      ? db.player.findMany({
          where: { id: { in: playerIds }, photoUrl: { not: null } },
          select: { id: true, photoUrl: true },
        })
      : Promise.resolve([] as { id: string; photoUrl: string | null }[]),
    userIds.length
      ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firebaseUid: true },
        })
      : Promise.resolve([] as { id: string; firebaseUid: string }[]),
  ]);
  const byPlayer = new Map(players.map((p) => [p.id, p.photoUrl]));
  const uidOf = new Map(users.map((u) => [u.id, u.firebaseUid]));
  const byUid = await photosByUidRaw(db, [...uidOf.values()]);
  for (const s of students) {
    const photo =
      (s.playerId && byPlayer.get(s.playerId)) ||
      (s.userId && byUid.get(uidOf.get(s.userId) ?? ''));
    if (ok(photo)) out.set(s.id, photo);
  }
  return out;
}

/** Foto por uid de Firebase: legajo de staff, ficha del padrón o perfil de profe. */
export async function photosByUid(
  db: Db,
  uids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  // Las fotos son un adorno: si algo falla, la pantalla sigue con iniciales.
  return photosByUidRaw(db, uids).catch(() => new Map<string, string>());
}

/** Foto de alumnos de un profe: su ficha del padrón o su cuenta. */
export async function studentPhotos(
  db: Db,
  students: { id: string; playerId?: string | null; userId?: string | null }[],
): Promise<Map<string, string>> {
  if (!students.length) return new Map();
  return studentPhotosRaw(db, students).catch(() => new Map<string, string>());
}
