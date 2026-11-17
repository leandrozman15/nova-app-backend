import { Body, Controller, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { BroadcastDto, RegisterDeviceDto, RemoveDeviceDto } from './dto/push.dto';
import { PushService } from './push.service';

function authOf(req: unknown) {
  const a = (req as RequestWithAuth).auth;
  if (!a?.uid) throw new UnauthorizedException('Missing auth context');
  return a;
}

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Cualquier usuario autenticado (también el usuario libre) registra su dispositivo. */
  @NoTenant()
  @Post('devices')
  register(@Req() req: unknown, @Body() dto: RegisterDeviceDto) {
    return this.push.register(authOf(req), dto);
  }

  @NoTenant()
  @Post('devices/remove')
  remove(@Req() req: unknown, @Body() dto: RemoveDeviceDto) {
    return this.push.remove(authOf(req), dto.token);
  }

  /** Aviso de la dirección del club a toda su comunidad. */
  @Roles('admin', 'manager', 'coordinator')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('clubs/:clubId/broadcast')
  broadcast(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: BroadcastDto) {
    requireClubScope(req, clubId);
    return this.push.broadcastToClub(requireCompanyId(req), clubId, dto, authOf(req).uid);
  }
}
