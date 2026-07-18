import { UnauthorizedException } from '@nestjs/common';

import type { RequestWithAuth } from '../interfaces/request-with-auth.interface';

export function requireCompanyId(req: unknown): string {
  const typedReq = req as RequestWithAuth;

  if (!typedReq.companyId) {
    throw new UnauthorizedException('Missing tenant in request');
  }

  return typedReq.companyId;
}
