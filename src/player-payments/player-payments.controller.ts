import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreatePlayerPaymentDto } from './dto/create-player-payment.dto';
import { UpdatePlayerPaymentDto } from './dto/update-player-payment.dto';
import { PlayerPaymentsService } from './player-payments.service';

@Controller('player-payments')
export class PlayerPaymentsController {
  constructor(private readonly playerPaymentsService: PlayerPaymentsService) {}

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get()
  list(
    @Req() req: unknown,
    @Query('clubId') clubId?: string,
    @Query('playerId') playerId?: string,
  ) {
    return this.playerPaymentsService.list(requireCompanyId(req), { clubId, playerId });
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.playerPaymentsService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreatePlayerPaymentDto) {
    return this.playerPaymentsService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdatePlayerPaymentDto) {
    return this.playerPaymentsService.update(requireCompanyId(req), id, dto);
  }
}