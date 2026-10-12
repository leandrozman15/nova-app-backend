import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithAuth } from '../interfaces/request-with-auth.interface';

const ROLE_ALIASES: Record<string, string[]> = {
  admin: ['admin', 'fed_admin'],
  manager: ['manager', 'club_admin', 'league_admin', 'municipal_admin', 'municipal_secretary'],
  coach: ['coach', 'coach_lvl1', 'coach_lvl2', 'coordinator'],
  player: ['player'],
  member: ['member', 'fan'],
};

const GLOBAL_ROLES = new Set([
  'admin',
  'fed_admin',
  'league_admin',
  'municipal_secretary',
  'municipal_admin',
  'municipal_inspector',
]);

function normalizeRoles(rawRole: string): string[] {
  const role = rawRole.trim();
  return ROLE_ALIASES[role] ?? [role];
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();

    if (!request.auth?.uid || !request.companyId) {
      throw new UnauthorizedException('Missing auth context');
    }

    const user = await this.prisma.user.findFirst({
      where: { firebaseUid: request.auth.uid },
      select: { id: true, role: true, companyId: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found for tenant');
    }

    // Un rol global solo rige dentro de la empresa del propio usuario. Fuera de
    // ella (o para usuarios libres sin empresa) el permiso sale de la membresía.
    let effectiveRole = user.role.trim().toLowerCase();
    const hasGlobalRoleInTenant =
      GLOBAL_ROLES.has(effectiveRole) && user.companyId === request.companyId;
    if (!hasGlobalRoleInTenant) {
      if (!request.auth.clubId) {
        throw new UnauthorizedException('Missing active club claim');
      }

      const membership = await this.prisma.clubMembership.findFirst({
        where: {
          userId: user.id,
          companyId: request.companyId,
          clubId: request.auth.clubId,
          status: 'ACTIVA',
          club: { is: { companyId: request.companyId } },
        },
        select: { role: true },
      });

      if (!membership) {
        throw new ForbiddenException('Active club membership required');
      }

      effectiveRole = membership.role.trim().toLowerCase();
    }

    request.auth.role = effectiveRole;
    request.auth.roles = [effectiveRole];

    const effectiveRoles = normalizeRoles(effectiveRole);
    const normalizedRequiredRoles = requiredRoles.flatMap((role) => normalizeRoles(role));
    const hasAccess = effectiveRoles.some((role) => normalizedRequiredRoles.includes(role));

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
