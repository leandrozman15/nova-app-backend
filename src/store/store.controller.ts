import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { StoreOrderStatus } from '@prisma/client';
import type { Response } from 'express';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { actorOf } from '../platform/platform.controller';
import { ClubStoreService } from './club-store.service';
import { CommissionsService } from './commissions.service';
import {
  AcceptInvitationDto,
  CancelOrderDto,
  ClearCommissionRuleDto,
  ClubStoreSettingsDto,
  CommissionLimitsDto,
  CommissionPreviewDto,
  CommissionReportDto,
  CreateMerchantDto,
  CreateStoreOrderDto,
  DeliverOrderDto,
  InviteMerchantDto,
  ListStoreDto,
  ProductDto,
  ReasonDto,
  SetCommissionRuleDto,
  SetPaymentAccountDto,
  UpdateMerchantFiscalDto,
  UpdateMerchantProfileDto,
  UpdateProductDto,
  VerifyCuitDto,
} from './dto/store.dto';
import { MerchantPortalService } from './merchant-portal.service';
import { MerchantsService } from './merchants.service';
import { STORE_CATEGORIES } from './store-categories';
import { StoreOrdersService } from './store-orders.service';
import { StorePublicService } from './store-public.service';

const CLUB_STAFF = ['admin', 'club_admin', 'manager', 'coordinator'];
const ORDER_STATUSES = [
  'PLACED',
  'CONFIRMED',
  'AT_CLUB',
  'DELIVERED',
  'CANCELLED',
];

function uid(req: unknown) {
  const auth = (req as RequestWithAuth).auth;
  if (!auth?.uid) throw new UnauthorizedException('Missing auth context');
  return auth.uid;
}

/** Panel de Fluxion: alta y gestión de comercios. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform/merchants')
export class PlatformMerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.merchants.list(
      ['INVITADO', 'ACTIVO', 'SUSPENDIDO'].includes(status ?? '')
        ? status
        : undefined,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.merchants.get(id);
  }

  @Post()
  create(@Req() req: unknown, @Body() dto: CreateMerchantDto) {
    return this.merchants.create(actorOf(req), dto);
  }

  @Put(':id/fiscal')
  updateFiscal(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: UpdateMerchantFiscalDto,
  ) {
    return this.merchants.updateFiscal(actorOf(req), id, dto);
  }

  @Post(':id/verify-cuit')
  verify(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: VerifyCuitDto,
  ) {
    return this.merchants.verifyCuit(actorOf(req), id, dto.note);
  }

  @Post(':id/invitations')
  invite(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: InviteMerchantDto,
  ) {
    return this.merchants.invite(actorOf(req), id, dto);
  }

  @Post(':id/invitations/:invitationId/revoke')
  revoke(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.merchants.revokeInvitation(actorOf(req), id, invitationId);
  }

  @Post(':id/suspend')
  suspend(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.merchants.suspend(actorOf(req), id, dto.reason);
  }

  @Post(':id/reactivate')
  reactivate(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.merchants.reactivate(actorOf(req), id, dto.reason);
  }
}

/** Panel de Fluxion: comisiones de la tienda. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform/commissions')
export class PlatformCommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get()
  overview() {
    return this.commissions.overview();
  }

  @Get('history')
  history(
    @Query('scope') scope?: string,
    @Query('clubId') clubId?: string,
    @Query('merchantId') merchantId?: string,
  ) {
    return this.commissions.history({ scope, clubId, merchantId });
  }

  @Post('rules')
  set(@Req() req: unknown, @Body() dto: SetCommissionRuleDto) {
    return this.commissions.setRule(actorOf(req), dto);
  }

  @Post('rules/clear')
  clear(@Req() req: unknown, @Body() dto: ClearCommissionRuleDto) {
    return this.commissions.clearRule(actorOf(req), dto);
  }

  @Put('limits')
  limits(@Req() req: unknown, @Body() dto: CommissionLimitsDto) {
    return this.commissions.setLimits(actorOf(req), dto);
  }

  @Get('preview')
  preview(@Query() dto: CommissionPreviewDto) {
    return this.commissions.preview(dto);
  }

  @Get('report')
  report(@Query() dto: CommissionReportDto) {
    return this.commissions.report(dto);
  }
}

/** Invitación: datos visibles antes de iniciar sesión. */
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('merchant-invitations')
export class MerchantInvitationsController {
  constructor(private readonly portal: MerchantPortalService) {}

  @Get(':token')
  info(@Param('token') token: string) {
    return this.portal.invitationInfo(token);
  }
}

/** Portal del comercio (usuarios con cuenta, miembros del comercio). */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('merchant-portal')
export class MerchantPortalController {
  constructor(private readonly portal: MerchantPortalService) {}

  @Post('accept')
  accept(@Req() req: unknown, @Body() dto: AcceptInvitationDto) {
    return this.portal.accept(actorOf(req), dto.token);
  }

  @Get()
  mine(@Req() req: unknown) {
    return this.portal.mine(uid(req));
  }

  @Get(':merchantId')
  get(@Req() req: unknown, @Param('merchantId') merchantId: string) {
    return this.portal.get(uid(req), merchantId);
  }

  @Put(':merchantId/profile')
  profile(
    @Req() req: unknown,
    @Param('merchantId') merchantId: string,
    @Body() dto: UpdateMerchantProfileDto,
  ) {
    return this.portal.updateProfile(actorOf(req), merchantId, dto);
  }

  @Put(':merchantId/payment-account')
  paymentAccount(
    @Req() req: unknown,
    @Param('merchantId') merchantId: string,
    @Body() dto: SetPaymentAccountDto,
  ) {
    return this.portal.setPaymentAccount(actorOf(req), merchantId, dto);
  }

  @Get(':merchantId/products')
  products(@Req() req: unknown, @Param('merchantId') merchantId: string) {
    return this.portal.products(uid(req), merchantId);
  }

  @Post(':merchantId/products')
  createProduct(
    @Req() req: unknown,
    @Param('merchantId') merchantId: string,
    @Body() dto: ProductDto,
  ) {
    return this.portal.createProduct(uid(req), merchantId, dto);
  }

  @Put(':merchantId/products/:id')
  updateProduct(
    @Req() req: unknown,
    @Param('merchantId') merchantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.portal.updateProduct(uid(req), merchantId, id, dto);
  }

  @Get(':merchantId/orders')
  orders(
    @Req() req: unknown,
    @Param('merchantId') merchantId: string,
    @Query('status') status?: string,
  ) {
    return this.portal.listOrders(
      uid(req),
      merchantId,
      ORDER_STATUSES.includes(status ?? '')
        ? (status as StoreOrderStatus)
        : undefined,
    );
  }

  @Post(':merchantId/orders/:id/confirm')
  confirm(
    @Req() req: unknown,
    @Param('merchantId') merchantId: string,
    @Param('id') id: string,
  ) {
    return this.portal.confirmOrder(uid(req), merchantId, id);
  }

  @Post(':merchantId/orders/:id/cancel')
  cancel(
    @Req() req: unknown,
    @Param('merchantId') merchantId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.portal.cancelOrder(uid(req), merchantId, id, dto.reason);
  }
}

/** Consola del club: tienda y retiros. */
@Roles(...CLUB_STAFF)
@Controller('clubs/:clubId/store')
export class ClubStoreController {
  constructor(private readonly service: ClubStoreService) {}

  @Get('settings')
  settings(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.settings(requireCompanyId(req), clubId);
  }

  @Put('settings')
  update(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: ClubStoreSettingsDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.update(requireCompanyId(req), clubId, dto);
  }

  @Get('orders')
  orders(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query('scope') scope?: string,
  ) {
    requireClubScope(req, clubId);
    return this.service.list(
      requireCompanyId(req),
      clubId,
      scope === 'history' ? 'history' : 'active',
    );
  }

  @Post('orders/:id/confirm')
  confirm(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    requireClubScope(req, clubId);
    return this.service.confirm(requireCompanyId(req), clubId, id);
  }

  @Post('orders/:id/receive')
  receive(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    requireClubScope(req, clubId);
    return this.service.receive(requireCompanyId(req), clubId, id);
  }

  @Post('orders/:id/deliver')
  deliver(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: DeliverOrderDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.deliver(
      requireCompanyId(req),
      clubId,
      id,
      dto.pickupCode,
    );
  }

  @Post('orders/:id/cancel')
  cancel(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.cancel(requireCompanyId(req), clubId, id, dto.reason);
  }
}

/** App: catálogo de la tienda. */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public/store')
export class PublicStoreController {
  constructor(private readonly service: StorePublicService) {}

  @Get('categories')
  categories() {
    return STORE_CATEGORIES;
  }

  @Get('products')
  products(@Query() query: ListStoreDto) {
    return this.service.list(query);
  }

  @Get('pickup-clubs')
  pickupClubs(@Query('category') category?: string) {
    return this.service.pickupClubs(category);
  }

  @Get('merchants/:id')
  merchant(@Param('id') id: string) {
    return this.service.merchant(id);
  }
}

/** Fotos de productos (públicas, para <img>; cacheables). */
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 600, ttl: 60_000 } })
@Controller('public/store/images')
export class StoreImagesController {
  constructor(private readonly service: StorePublicService) {}

  @Get(':kind/:id')
  async image(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const result = await this.service.image(kind, id);
    if ('redirect' in result) return res.redirect(302, result.redirect);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(result.body);
  }
}

/** App: pedidos del usuario. */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('users/me/store-orders')
export class MyStoreOrdersController {
  constructor(private readonly orders: StoreOrdersService) {}

  @Get()
  list(@Req() req: unknown) {
    return this.orders.listForBuyer(uid(req));
  }

  @Post()
  create(@Req() req: unknown, @Body() dto: CreateStoreOrderDto) {
    return this.orders.create(uid(req), dto);
  }

  @Post(':id/cancel')
  cancel(@Req() req: unknown, @Param('id') id: string) {
    return this.orders.cancelByBuyer(uid(req), id);
  }
}
