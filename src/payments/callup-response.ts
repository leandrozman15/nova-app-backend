import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

export const CALLUP_RESPONSES = ['pending', 'confirmed', 'unavailable'] as const;
export type CallupResponse = (typeof CALLUP_RESPONSES)[number];

/**
 * Respuesta del jugador (o de su padre/tutor) a una citación ya publicada.
 * `callupId` es el que entrega la lista de citaciones: `fx:<docId>` (fixture del club,
 * documento match_callups) o `lg:<id>` (partido de liga, tabla MatchCallup).
 */
export async function respondToCallup(
  prisma: Pick<PrismaService, 'matchCallup' | 'storeDocument'>,
  input: { playerId: string; callupId: string; status: string; by: 'guardian' | 'player' },
  now = new Date(),
) {
  const status = input.status as CallupResponse;
  if (!CALLUP_RESPONSES.includes(status)) throw new BadRequestException('Estado de citación inválido');
  const [kind, ...rest] = input.callupId.split(':');
  const ref = rest.join(':');
  if (!ref) throw new BadRequestException('Citación inválida');

  if (kind === 'lg') {
    const found = await prisma.matchCallup.findFirst({
      where: { id: ref, playerExternalId: input.playerId, publishedAt: { not: null } },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Citación no encontrada');
    await prisma.matchCallup.update({ where: { id: found.id }, data: { status } });
    return { id: input.callupId, status };
  }

  if (kind === 'fx') {
    const path = `match_callups/${ref}`;
    const doc = await prisma.storeDocument.findUnique({ where: { path }, select: { data: true } });
    const data = (doc?.data ?? null) as Record<string, unknown> | null;
    if (!data || data.playerId !== input.playerId || data.published !== true)
      throw new NotFoundException('Citación no encontrada');
    await prisma.storeDocument.update({
      where: { path },
      data: { data: { ...data, status, respondedAt: now.toISOString(), respondedBy: input.by } as any },
    });
    return { id: input.callupId, status };
  }

  throw new BadRequestException('Citación inválida');
}
