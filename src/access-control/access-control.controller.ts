import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { AccessControlService } from './access-control.service';
import { ScanDto } from './dto/scan.dto';

const thisMonth = () => {
  const now = new Date();
  return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };
};

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
@Roles('admin', 'manager', 'coach', 'access_control')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('clubs/:clubId/access')
export class AccessControlController {
  constructor(private readonly access: AccessControlService) {}

  /** Alias histórico: igual que /confirm (ficha directo), por compatibilidad. */
  @Post('scan')
  scan(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: ScanDto) {
    requireClubScope(req, clubId);
    return this.access.confirm(
      requireCompanyId(req),
      clubId,
      (req as RequestWithAuth).auth?.uid,
      dto.token,
    );
  }

  /** El terminal lee el QR y muestra el semáforo + si es entrada o salida, sin fichar todavía. */
  @Post('preview')
  preview(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: ScanDto) {
    requireClubScope(req, clubId);
    return this.access.preview(requireCompanyId(req), clubId, dto.token);
  }

  /** El atleta confirma en el terminal: recién ahí se ficha la entrada o salida. */
  @Post('confirm')
  confirm(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: ScanDto) {
    requireClubScope(req, clubId);
    return this.access.confirm(
      requireCompanyId(req),
      clubId,
      (req as RequestWithAuth).auth?.uid,
      dto.token,
    );
  }

  @Get('log')
  log(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query('limit') limit?: string,
    @Query('playerId') playerId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    requireClubScope(req, clubId);
    return this.access.recent(requireCompanyId(req), clubId, Number(limit) || 30, {
      playerId,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
    });
  }
}

/** Familias: ingresos y salidas del club de un hijo/a, mes a mes. */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 40, ttl: 60_000 } })
@Controller('users/me/children/:playerId/access-log')
export class GuardianAccessLogController {
  constructor(private readonly access: AccessControlService) {}

  @Get()
  mine(
    @Req() req: unknown,
    @Param('playerId') playerId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const fallback = thisMonth();
    return this.access.forGuardian(
      (req as RequestWithAuth).auth!,
      playerId,
      month ? Number(month) : fallback.month,
      year ? Number(year) : fallback.year,
    );
  }
}
