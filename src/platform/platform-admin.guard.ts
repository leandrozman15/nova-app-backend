import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';

/**
 * Dueño de la plataforma Fluxion (no confundir con el admin de una empresa).
 * Por defecto es la cuenta maestra; se puede ampliar con PLATFORM_ADMIN_UIDS y
 * PLATFORM_ADMIN_EMAILS (separados por coma). El email solo cuenta si está verificado.
 */
const DEFAULT_UIDS = ['gP2wfenUBpXxvD1BddK6YN5eivW2'];
const DEFAULT_EMAILS = ['leozman15@gmail.com'];

function list(value: string | undefined, fallback: string[]) {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return items.length > 0 ? items : fallback.map((item) => item.toLowerCase());
}

export function isPlatformAdmin(auth: RequestWithAuth['auth']) {
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

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    if (!isPlatformAdmin(request.auth))
      throw new ForbiddenException('Solo el administrador de Fluxion.');
    return true;
  }
}
