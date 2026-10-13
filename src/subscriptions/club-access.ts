import type { Prisma } from '@prisma/client';

/** Estados de suscripción que sacan al club de la app y bloquean su consola. */
export const BLOCKING_SUBSCRIPTION = ['SUSPENDED', 'CANCELLED'] as const;

/**
 * Filtro para todo lo público: un club suspendido o dado de baja no aparece en
 * la app (los clubes sin suscripción cargada siguen visibles).
 */
export const CLUB_IN_GOOD_STANDING: Prisma.ClubWhereInput = {
  NOT: { subscription: { is: { status: { in: [...BLOCKING_SUBSCRIPTION] } } } },
};
