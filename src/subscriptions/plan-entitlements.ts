import { ForbiddenException, SetMetadata } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { athleteLimit, seatsProblem } from './plan-rules';

export type PlanPack = 'buffet' | 'integrations';

export const REQUIRES_PACK = 'fluxion:requires-pack';
/** La ruta necesita que el club tenga ese pack contratado (si tiene suscripción cargada). */
export const RequiresPack = (pack: PlanPack) =>
  SetMetadata(REQUIRES_PACK, pack);

const PACK_LABEL: Record<PlanPack, string> = {
  buffet: 'Pack Buffet',
  integrations: 'Pack Integraciones',
};

type Db = Pick<PrismaService, 'clubSubscription' | 'player'>;

/** Lo que el plan del club habilita. Sin suscripción cargada (pilotos): todo, sin límite. */
export async function clubEntitlements(prisma: Db, clubId: string) {
  const sub = await prisma.clubSubscription.findUnique({
    where: { clubId },
    select: {
      extraBlocks: true,
      buffetPack: true,
      integrationsPack: true,
      plan: { select: { includedAthletes: true, extraBlockSize: true } },
    },
  });
  if (!sub)
    return {
      limited: false as const,
      athleteLimit: null,
      buffet: true,
      integrations: true,
    };
  return {
    limited: true as const,
    athleteLimit: athleteLimit(sub.plan, sub),
    buffet: sub.buffetPack,
    integrations: sub.integrationsPack,
  };
}

export function activeAthletes(prisma: Db, clubId: string) {
  return prisma.player.count({ where: { clubId, active: true } });
}

/** Corta el alta si sumar `adding` atletas activos supera el cupo del plan. */
export async function assertAthleteSeats(
  prisma: Db,
  clubId: string | null | undefined,
  adding = 1,
) {
  if (!clubId || adding <= 0) return;
  const ent = await clubEntitlements(prisma, clubId);
  if (!ent.limited) return;
  const problem = seatsProblem(
    ent.athleteLimit,
    await activeAthletes(prisma, clubId),
    adding,
  );
  if (problem) throw new ForbiddenException(problem);
}

export async function assertPack(prisma: Db, clubId: string, pack: PlanPack) {
  const ent = await clubEntitlements(prisma, clubId);
  if (!ent[pack])
    throw new ForbiddenException(
      `Esta función es parte del ${PACK_LABEL[pack]}, que el club no tiene contratado. Pedile a Fluxion que lo active.`,
    );
}
