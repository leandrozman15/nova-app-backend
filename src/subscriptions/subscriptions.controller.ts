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
import { requireClubScope } from '../common/http/request-context';
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
import { SubscriptionsService } from './subscriptions.service';

/** Panel de Fluxion: planes, suscripciones de clubes y mensualidades. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform/subscriptions')
export class PlatformSubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

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
  constructor(private readonly service: SubscriptionsService) {}

  @Get()
  get(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.forClub(clubId);
  }
}
