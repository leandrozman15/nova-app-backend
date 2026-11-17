import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsIn, IsOptional } from 'class-validator';

import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { ClubAccessService } from './club-access.service';

class AccessDto {
  @IsIn(['athlete', 'guardian']) who!: 'athlete' | 'guardian';
  @IsOptional() @IsIn(['create', 'reset']) action?: 'create' | 'reset';
}

/** Accesos a la app desde el legajo (solo la dirección del club). */
@Roles('admin', 'manager')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('clubs/:clubId')
export class ClubAccessController {
  constructor(private readonly access: ClubAccessService) {}

  @Post('players/:playerId/access')
  player(@Req() req: unknown, @Param('clubId') clubId: string, @Param('playerId') playerId: string, @Body() dto: AccessDto) {
    requireClubScope(req, clubId);
    const companyId = requireCompanyId(req);
    const action = dto.action ?? 'create';
    return dto.who === 'athlete'
      ? this.access.athlete(companyId, clubId, playerId, action)
      : this.access.guardian(companyId, clubId, playerId, action);
  }

  @Post('staff/:uid/access/reset')
  staff(@Req() req: unknown, @Param('clubId') clubId: string, @Param('uid') uid: string) {
    requireClubScope(req, clubId);
    return this.access.staffReset(clubId, uid);
  }
}
