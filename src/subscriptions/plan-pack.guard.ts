import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PlatformAccessService } from '../platform/platform-admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRES_PACK, assertPack, type PlanPack } from './plan-entitlements';
import { clubIdFromRequest } from './suspended-club.guard';

/** Rutas marcadas con @RequiresPack: el club tiene que tener el pack (los admins de Fluxion pasan). */
@Injectable()
export class PlanPackGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const pack = this.reflector.getAllAndOverride<PlanPack | undefined>(
      REQUIRES_PACK,
      [context.getHandler(), context.getClass()],
    );
    if (!pack) return true;
    const request = context
      .switchToHttp()
      .getRequest<
        RequestWithAuth & {
          params?: Record<string, string>;
          route?: { path?: string };
        }
      >();
    const clubId = clubIdFromRequest(request);
    if (!clubId) return true;
    if (await this.access.roleOf(request.auth)) return true;
    await assertPack(this.prisma, clubId, pack);
    return true;
  }
}
