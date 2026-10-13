import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PlatformAccessService } from '../platform/platform-admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BLOCKING_SUBSCRIPTION } from './club-access';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** clubId de la ruta: /clubs/:clubId/... o PATCH/DELETE /clubs/:id. */
export function clubIdFromRequest(request: {
  params?: Record<string, string>;
  route?: { path?: string };
}) {
  const params = request.params ?? {};
  if (params.clubId) return params.clubId;
  const path = request.route?.path ?? '';
  if (/^\/?clubs\/:id(\/|$)/.test(path)) return params.id;
  return undefined;
}

/**
 * Club con suscripción suspendida o dada de baja: su consola queda en solo
 * lectura (puede ver todo y regularizar, pero no modificar). Los
 * administradores de Fluxion no tienen esta restricción.
 */
@Injectable()
export class SuspendedClubGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      RequestWithAuth & {
        params?: Record<string, string>;
        route?: { path?: string };
      }
    >();
    if (READ_METHODS.has(request.method)) return true;
    const clubId = clubIdFromRequest(request);
    if (!clubId) return true;

    const subscription = await this.prisma.clubSubscription.findUnique({
      where: { clubId },
      select: { status: true },
    });
    if (
      !subscription ||
      !(BLOCKING_SUBSCRIPTION as readonly string[]).includes(
        subscription.status,
      )
    )
      return true;
    if (await this.access.roleOf(request.auth)) return true;

    throw new ForbiddenException(
      subscription.status === 'CANCELLED'
        ? 'La suscripción del club está dada de baja: la consola es de solo lectura. Escribinos para reactivarla.'
        : 'La suscripción del club está suspendida: la consola es de solo lectura hasta regularizar el pago.',
    );
  }
}
