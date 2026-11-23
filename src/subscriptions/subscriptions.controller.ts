import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { actorOf } from '../platform/platform.controller';
import {
  CreatePlanDto,
  GenerateInvoicesDto,
  ListInvoicesDto,
  MarkInvoiceDto,
  ReasonDto,
  UpdatePlanDto,
  UpsertSubscriptionDto,
} from './dto/subscription.dto';
import {
  ListPlanRequestsDto,
  PlanRequestDto,
  ResolvePlanRequestDto,
} from './dto/plan-request.dto';
import { PlanRequestsService } from './plan-requests.service';
import { SubscriptionsService } from './subscriptions.service';

/** Panel de Fluxion: planes, suscripciones de clubes y mensualidades. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform/subscriptions')
export class PlatformSubscriptionsController {
  constructor(
    private readonly service: SubscriptionsService,
    private readonly requests: PlanRequestsService,
  ) {}

  /** Pedidos de los clubes desde "Mi plan". */
  @Get('requests')
  listRequests(@Query() query: ListPlanRequestsDto) {
    return this.requests.list(query.status);
  }

  @Post('requests/:id/resolve')
  resolveRequest(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: ResolvePlanRequestDto,
  ) {
    return this.requests.resolve(actorOf(req), id, dto);
  }

  @Get('plans')
  plans() {
    return this.service.listPlans();
  }

  @Post('plans')
  createPlan(@Req() req: unknown, @Body() dto: CreatePlanDto) {
    return this.service.createPlan(actorOf(req), dto);
  }

  @Patch('plans/:id')
  updatePlan(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.service.updatePlan(actorOf(req), id, dto);
  }

  @Get('clubs')
  clubs() {
    return this.service.listClubs();
  }

  @Put('clubs/:clubId')
  upsert(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: UpsertSubscriptionDto,
  ) {
    return this.service.upsert(actorOf(req), clubId, dto);
  }

  @Post('clubs/:clubId/suspend')
  suspend(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.suspend(actorOf(req), clubId, dto.reason);
  }

  @Post('clubs/:clubId/reactivate')
  reactivate(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.reactivate(actorOf(req), clubId, dto.reason);
  }

  @Post('clubs/:clubId/cancel')
  cancel(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.cancel(actorOf(req), clubId, dto.reason);
  }

  @Post('invoices/generate')
  generate(@Req() req: unknown, @Body() dto: GenerateInvoicesDto) {
    return this.service.generateInvoices(actorOf(req), dto.period);
  }

  @Get('invoices')
  invoices(@Query() query: ListInvoicesDto) {
    return this.service.listInvoices(query);
  }

  @Post('invoices/:id/status')
  markInvoice(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: MarkInvoiceDto,
  ) {
    return this.service.markInvoice(actorOf(req), id, dto);
  }
}

/** Consola del club: estado de su suscripción y mensualidades pendientes. */
@Roles('admin', 'club_admin', 'manager', 'coordinator')
@Controller('clubs/:clubId/subscription')
export class ClubSubscriptionController {
  constructor(
    private readonly service: SubscriptionsService,
    private readonly requests: PlanRequestsService,
  ) {}

  @Get()
  get(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.forClub(clubId);
  }

  /** "Mi plan": estado, cupo, precios, datos para transferir y pedidos del club. */
  @Roles('admin', 'club_admin', 'manager')
  @Get('plan')
  plan(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.requests.myPlan(clubId);
  }

  /** Pedir más usuarios, un pack, el alta del plan o avisar un pago (se puede aunque el club esté suspendido). */
  @Roles('admin', 'club_admin', 'manager')
  @Post('requests')
  request(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: PlanRequestDto,
  ) {
    requireClubScope(req, clubId);
    const auth = (req as RequestWithAuth).auth!;
    return this.requests.request(
      clubId,
      requireCompanyId(req),
      { uid: auth.uid, name: auth.email ?? null },
      dto,
    );
  }
}
