import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import type { RequestWithAuth } from '../interfaces/request-with-auth.interface';

export function requireCompanyId(req: unknown): string {
  const typedReq = req as RequestWithAuth;

  if (!typedReq.companyId) {
    throw new UnauthorizedException('Missing tenant in request');
  }

  return typedReq.companyId;
}

// Roles que operan sobre toda la empresa (no atados a un club).
export const COMPANY_WIDE_ROLES = new Set([
  'admin',
  'fed_admin',
  'league_admin',
  'municipal_secretary',
  'municipal_admin',
  'municipal_inspector',
]);

/**
 * Exige que el actor opere sobre `clubId`: los roles de empresa pasan;
 * el resto debe tener ese club como club activo (claim validado por RolesGuard).
 * Debe usarse después de RolesGuard, que deja en `auth.role` el rol efectivo.
 */
export function requireClubScope(req: unknown, clubId: string): void {
  const typedReq = req as RequestWithAuth;
  const role = typedReq.auth?.role?.trim().toLowerCase();

  if (role && COMPANY_WIDE_ROLES.has(role)) return;
  if (!typedReq.auth?.clubId || typedReq.auth.clubId !== clubId) {
    throw new ForbiddenException('Club fuera de tu contexto activo');
  }
}
