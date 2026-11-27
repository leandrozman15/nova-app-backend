import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { AutoDebitService } from './auto-debit.service';
import { CollectAutoDebitDto, SetAutoDebitDto } from './dto/auto-debit.dto';

/** Tesorería y administración: adhesiones al débito automático y registro de los abonos debitados. */
@Roles('admin', 'manager')
@Controller('clubs/:clubId/auto-debit')
export class AutoDebitController {
  constructor(private readonly autoDebit: AutoDebitService) {}

  @Get()
  list(@Req() req: unknown, @Param('clubId') clubId: string, @Query('month') month: string, @Query('year') year: string) {
    requireClubScope(req, clubId);
    const m = Number(month);
    const y = Number(year);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y)) throw new BadRequestException('Mes y año inválidos');
    return this.autoDebit.list(requireCompanyId(req), clubId, m, y);
  }

  @Put('players/:playerId')
  set(@Req() req: unknown, @Param('clubId') clubId: string, @Param('playerId') playerId: string, @Body() dto: SetAutoDebitDto) {
    requireClubScope(req, clubId);
    return this.autoDebit.set(requireCompanyId(req), clubId, playerId, (req as RequestWithAuth).auth?.uid, dto);
  }

  @Post('collect')
  collect(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: CollectAutoDebitDto) {
    requireClubScope(req, clubId);
    return this.autoDebit.collect(requireCompanyId(req), clubId, dto);
  }
}
