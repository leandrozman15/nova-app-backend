import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type AuditActor = { uid: string; email?: string | null };

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Decimal/Date → valores planos para que el registro sea legible.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Registro de acciones de plataforma. La tabla no admite edición ni borrado (trigger). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    actor: AuditActor,
    action: string,
    entity: { type: string; id?: string | null },
    change: { before?: unknown; after?: unknown; reason?: string | null } = {},
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorUid: actor.uid,
        actorEmail: actor.email ?? null,
        action,
        entityType: entity.type,
        entityId: entity.id ?? null,
        before: toJson(change.before),
        after: toJson(change.after),
        reason: change.reason ?? null,
      },
    });
  }

  list(query: { entityType?: string; entityId?: string; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(query.entityType && { entityType: query.entityType }),
        ...(query.entityId && { entityId: query.entityId }),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.take ?? 200, 500),
    });
  }
}
