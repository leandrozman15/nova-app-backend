import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { Actor, BuffetService } from './buffet.service';
import {
  AdjustStockDto,
  CloseSessionDto,
  CreateProductDto,
  CreateSaleDto,
  OpenSessionDto,
  RegisterCanonDto,
  UpdateBuffetDto,
  UpdateProductDto,
  VoidSaleDto,
} from './dto/buffet.dto';

const MANAGE = ['admin', 'manager'] as const;
/** Carta de solo lectura: todo el club (jugadores, staff, directores). */
const VIEW_MENU = ['admin', 'manager', 'coach', 'player', 'member', 'buffet'] as const;
const OPERATE = ['admin', 'manager', 'buffet'] as const;

function ctx(req: unknown, clubId: string) {
  requireClubScope(req, clubId);
  const r = req as RequestWithAuth;
  const actor: Actor = { uid: r.auth?.uid ?? '', name: r.auth?.email };
  return { companyId: requireCompanyId(req), actor };
}

@Controller('buffet/:clubId')
export class BuffetController {
  constructor(private readonly buffet: BuffetService) {}

  @Roles(...VIEW_MENU)
  @Get('menu')
  menu(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.buffet.publicMenu(ctx(req, clubId).companyId, clubId);
  }

  @Roles(...OPERATE)
  @Get()
  get(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.buffet.getBuffet(ctx(req, clubId).companyId, clubId);
  }

  @Roles(...MANAGE)
  @Patch()
  update(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: UpdateBuffetDto) {
    return this.buffet.updateBuffet(ctx(req, clubId).companyId, clubId, dto);
  }

  @Roles(...MANAGE)
  @Post('canon')
  canon(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: RegisterCanonDto) {
    return this.buffet.registerCanon(ctx(req, clubId).companyId, clubId, dto);
  }

  // Productos y stock
  @Roles(...OPERATE)
  @Get('products')
  products(@Req() req: unknown, @Param('clubId') clubId: string, @Query('all') all?: string) {
    return this.buffet.listProducts(ctx(req, clubId).companyId, clubId, all === 'true');
  }

  @Roles(...OPERATE)
  @Post('products')
  createProduct(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: CreateProductDto) {
    const { companyId, actor } = ctx(req, clubId);
    return this.buffet.createProduct(companyId, clubId, actor, dto);
  }

  @Roles(...OPERATE)
  @Patch('products/:id')
  updateProduct(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.buffet.updateProduct(ctx(req, clubId).companyId, clubId, id, dto);
  }

  @Roles(...OPERATE)
  @Post('products/:id/stock')
  adjustStock(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string, @Body() dto: AdjustStockDto) {
    const { companyId, actor } = ctx(req, clubId);
    return this.buffet.adjustStock(companyId, clubId, id, actor, dto);
  }

  @Roles(...OPERATE)
  @Get('stock-movements')
  movements(@Req() req: unknown, @Param('clubId') clubId: string, @Query('productId') productId?: string) {
    return this.buffet.listMovements(ctx(req, clubId).companyId, clubId, productId);
  }

  // Caja
  @Roles(...OPERATE)
  @Get('session/current')
  current(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.buffet.currentSession(ctx(req, clubId).companyId, clubId);
  }

  @Roles(...OPERATE)
  @Post('session/open')
  open(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: OpenSessionDto) {
    const { companyId, actor } = ctx(req, clubId);
    return this.buffet.openSession(companyId, clubId, actor, dto.openingAmount);
  }

  @Roles(...OPERATE)
  @Get('sessions')
  sessions(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.buffet.listSessions(ctx(req, clubId).companyId, clubId);
  }

  @Roles(...OPERATE)
  @Get('sessions/:id')
  sessionSummary(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string) {
    return this.buffet.sessionSummary(ctx(req, clubId).companyId, clubId, id);
  }

  @Roles(...OPERATE)
  @Post('sessions/:id/close')
  close(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string, @Body() dto: CloseSessionDto) {
    const { companyId, actor } = ctx(req, clubId);
    return this.buffet.closeSession(companyId, clubId, id, actor, dto);
  }

  // Ventas
  @Roles(...OPERATE)
  @Post('sales')
  sale(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: CreateSaleDto) {
    const { companyId, actor } = ctx(req, clubId);
    return this.buffet.createSale(companyId, clubId, actor, dto);
  }

  @Roles(...OPERATE)
  @Post('sales/:id/void')
  voidSale(@Req() req: unknown, @Param('clubId') clubId: string, @Param('id') id: string, @Body() dto: VoidSaleDto) {
    const { companyId, actor } = ctx(req, clubId);
    return this.buffet.voidSale(companyId, clubId, id, actor, dto.reason);
  }

  // Reportes
  @Roles(...OPERATE)
  @Get('report')
  report(@Req() req: unknown, @Param('clubId') clubId: string, @Query('from') from: string, @Query('to') to: string) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    if (!from || !to || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('from y to (YYYY-MM-DD) son obligatorios');
    }
    // `to` es inclusivo.
    end.setUTCDate(end.getUTCDate() + 1);
    return this.buffet.report(ctx(req, clubId).companyId, clubId, start, end);
  }
}
