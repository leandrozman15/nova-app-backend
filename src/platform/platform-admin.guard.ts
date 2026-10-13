import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Administradores de la plataforma Fluxion (no confundir con el admin de una empresa).
 * - Cuenta maestra de respaldo (PLATFORM_ADMIN_UIDS / PLATFORM_ADMIN_EMAILS, con
 *   valores por defecto): nunca te quedás afuera.
 * - El resto, filas activas de PlatformAdmin (SUPERADMIN o SUPPORT = solo lectura).
 * - Con PLATFORM_REQUIRE_MFA=true se exige sesión con segundo factor.
 */
const DEFAULT_UIDS = ['gP2wfenUBpXxvD1BddK6YN5eivW2'];
const DEFAULT_EMAILS = ['leozman15@gmail.com'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type PlatformRole = 'SUPERADMIN' | 'SUPPORT';

function list(value: string | undefined, fallback: string[]) {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return items.length > 0 ? items : fallback.map((item) => item.toLowerCase());
}

/** Cuenta maestra (respaldo de configuración, no depende de la base). */
export function isBootstrapAdmin(auth: RequestWithAuth['auth']) {
  if (!auth?.uid) return false;
  const uids = list(process.env.PLATFORM_ADMIN_UIDS, DEFAULT_UIDS);
  if (uids.includes(auth.uid.toLowerCase())) return true;
  const emails = list(process.env.PLATFORM_ADMIN_EMAILS, DEFAULT_EMAILS);
  return Boolean(
    auth.emailVerified &&
    auth.email &&
    emails.includes(auth.email.toLowerCase()),
  );
}

export function mfaRequired() {
  return process.env.PLATFORM_REQUIRE_MFA === 'true';
}

@Injectable()
export class PlatformAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rol de plataforma del usuario, o null si no es administrador de Fluxion. */
  async roleOf(auth: RequestWithAuth['auth']): Promise<PlatformRole | null> {
    if (!auth?.uid) return null;
    if (isBootstrapAdmin(auth)) return 'SUPERADMIN';
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { firebaseUid: auth.uid },
      select: { role: true, active: true },
    });
    if (!admin?.active) return null;
    return admin.role === 'SUPPORT' ? 'SUPPORT' : 'SUPERADMIN';
  }
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly access: PlatformAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const role = await this.access.roleOf(request.auth);
    if (!role) throw new ForbiddenException('Solo administradores de Fluxion.');
    if (mfaRequired() && !request.auth?.mfa)
      throw new ForbiddenException(
        'Iniciá sesión con verificación en dos pasos para usar el panel de Fluxion.',
      );
    if (role === 'SUPPORT' && !READ_METHODS.has(request.method))
      throw new ForbiddenException('Tu acceso a Fluxion es de solo lectura.');
    return true;
  }
}
