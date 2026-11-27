import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { AccessControlService } from './access-control.service';
import { ScanDto } from './dto/scan.dto';

/** Mi QR de fichaje (atleta) o el de un hijo/a (tutor). Cambia cada 30 segundos. */
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 40, ttl: 60_000 } })
@Controller('users/me')
export class MyAccessTokenController {
  constructor(private readonly access: AccessControlService) {}

  @Get('access-token')
  token(@Req() req: unknown, @Query('playerId') playerId?: string) {
    return this.access.tokenFor((req as RequestWithAuth).auth!, playerId || undefined);
  }
}

/** Puerta del club: escanear el QR y ver el semáforo. */
@Roles('admin', 'manager', 'coach')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('clubs/:clubId/access')
export class AccessControlController {
  constructor(private readonly access: AccessControlService) {}

  @Post('scan')
  scan(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: ScanDto) {
    requireClubScope(req, clubId);
    return this.access.scan(
      requireCompanyId(req),
      clubId,
      (req as RequestWithAuth).auth?.uid,
      dto.token,
    );
  }

  @Get('log')
  log(@Req() req: unknown, @Param('clubId') clubId: string, @Query('limit') limit?: string) {
    requireClubScope(req, clubId);
    return this.access.recent(requireCompanyId(req), clubId, Number(limit) || 30);
  }
}
