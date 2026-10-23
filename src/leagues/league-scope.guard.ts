import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Un admin de liga con `leagueId` en su token solo opera sobre su liga y sus sub-ligas.
 * Los roles sin ese claim (empresa, municipio, club) conservan su alcance por empresa.
 */
@Injectable()
export class LeagueScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const ownLeagueId = req.auth?.leagueId;
    const targetId = (req.params as Record<string, string | undefined>)?.id;
    if (!ownLeagueId || !targetId || ownLeagueId === targetId) return true;

    const target = await this.prisma.league.findFirst({
      where: { id: targetId, companyId: req.companyId },
      select: { parentId: true },
    });
    // Si no existe, el servicio responde 404 con su propio mensaje.
    if (!target || target.parentId === ownLeagueId) return true;
    throw new ForbiddenException('Liga fuera de tu alcance');
  }
}
