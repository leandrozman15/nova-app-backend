import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithAuth } from '../interfaces/request-with-auth.interface';

const ROLE_ALIASES: Record<string, string[]> = {
  admin: ['admin', 'fed_admin'],
  manager: [
    'manager',
    'club_admin',
    'league_admin',
    'municipal_admin',
    'municipal_secretary',
  ],
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

// Roles de club que pueden venir en claims emitidos antes de ClubMembership.
const LEGACY_CLUB_ROLES = new Set([
  'club_admin',
  'buffet',
  'manager',
  'coordinator',
  'coach',
  'coach_lvl1',
  'coach_lvl2',
  'player',
  'member',
]);

/** Cuánto se recuerda el rol de un usuario entre pedidos. */
const ROLE_CACHE_MS = 30_000;

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Transición a ClubMembership: los usuarios de club creados antes no tienen
   * membresía y su club solo figura en los claims de Firebase. Si el token (que
   * firma el servidor) trae empresa, club y rol de club, y el usuario pertenece a
   * esa empresa, se crea la membresía ACTIVA con ese rol. Nunca reactiva una
   * membresía existente (rechazada, dada de baja o pendiente) ni aplica a
   * usuarios libres. Retirar cuando todas las cuentas viejas tengan membresía.
   */
  private async backfillLegacyMembership(
    user: { id: string; companyId: string | null },
    request: RequestWithAuth,
  ): Promise<{ role: string } | null> {
    const auth = request.auth;
    const claimRole = auth?.role?.trim().toLowerCase();
    const companyId = request.companyId;
    const clubId = auth?.clubId;

    if (!auth || !claimRole || !companyId || !clubId) return null;
    if (!LEGACY_CLUB_ROLES.has(claimRole)) return null;
    // Empresa del claim firmado (no solo del header) y del propio usuario.
    if (auth.companyId !== companyId || user.companyId !== companyId)
      return null;

    const [existing, club] = await Promise.all([
      this.prisma.clubMembership.findUnique({
        where: { userId_clubId: { userId: user.id, clubId } },
        select: { id: true },
      }),
      this.prisma.club.findFirst({
        where: { id: clubId, companyId },
        select: { id: true },
      }),
    ]);
    if (existing || !club) return null;

    try {
      const created = await this.prisma.clubMembership.create({
        data: {
          userId: user.id,
          companyId,
          clubId,
          role: claimRole,
          status: 'ACTIVA',
        },
        select: { role: true },
      });
      this.logger.log(
        `Membresía heredada creada: user=${user.id} club=${clubId} rol=${claimRole}`,
      );
      return created;
    } catch {
      // Otra petición la creó en paralelo: usar esa si quedó activa.
      return this.prisma.clubMembership.findFirst({
        where: { userId: user.id, clubId, companyId, status: 'ACTIVA' },
        select: { role: true },
      });
    }
  }

  /**
   * Usuario y membresía se consultan en cada pedido: se recuerdan unos segundos para no
   * pagar dos viajes a la base por pedido. Un cambio de rol tarda como mucho eso en regir.
   * Solo se recuerda lo encontrado (una ausencia se vuelve a consultar).
   */
  private readonly memo = new Map<string, { at: number; value: unknown }>();

  private async cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
    const hit = this.memo.get(key);
    if (hit && Date.now() - hit.at < ROLE_CACHE_MS) return hit.value as T;
    const value = await load();
    if (value) {
      this.memo.set(key, { at: Date.now(), value });
      if (this.memo.size > 5000) {
        const oldest = this.memo.keys().next().value;
        if (oldest !== undefined) this.memo.delete(oldest);
      }
    }
    return value;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();

    if (!request.auth?.uid || !request.companyId) {
      throw new UnauthorizedException('Missing auth context');
    }

    const user = await this.cached(`u|${request.auth.uid}`, () =>
      this.prisma.user.findFirst({
        where: { firebaseUid: request.auth!.uid },
        select: { id: true, role: true, companyId: true },
      }),
    );

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

      const clubId = request.auth.clubId;
      const companyId = request.companyId;
      const membership =
        (await this.cached(`m|${user.id}|${companyId}|${clubId}`, () =>
          this.prisma.clubMembership.findFirst({
            where: {
              userId: user.id,
              companyId,
              clubId,
              status: 'ACTIVA',
              club: { is: { companyId } },
            },
            select: { role: true },
          }),
        )) ?? (await this.backfillLegacyMembership(user, request));

      if (!membership) {
        throw new ForbiddenException('Active club membership required');
      }

      effectiveRole = membership.role.trim().toLowerCase();
    }

    request.auth.role = effectiveRole;
    request.auth.roles = [effectiveRole];

    const effectiveRoles = normalizeRoles(effectiveRole);
    const normalizedRequiredRoles = requiredRoles.flatMap((role) =>
      normalizeRoles(role),
    );
    const hasAccess = effectiveRoles.some((role) =>
      normalizedRequiredRoles.includes(role),
    );

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
