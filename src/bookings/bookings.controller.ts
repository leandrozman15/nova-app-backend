import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { BookingsService } from './bookings.service';
import {
  CancelBookingDto,
  ClubBookingsQueryDto,
  CreateBookingDto,
  SlotsQueryDto,
  SyncBookingPaymentDto,
} from './dto/booking.dto';

function auth(req: unknown) {
  const value = (req as RequestWithAuth).auth;
  if (!value?.uid) throw new UnauthorizedException('Missing auth context');
  return value;
}

/** Turnos de un día (usuarios con cuenta, sin empresa). */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public/clubs/:clubId/facilities/:facilityId/slots')
export class PublicSlotsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  slots(
    @Param('clubId') clubId: string,
    @Param('facilityId') facilityId: string,
    @Query() query: SlotsQueryDto,
  ) {
    return this.bookings.publicSlots(
      clubId,
      facilityId,
      query.date,
      query.duration,
    );
  }
}

/** Reservas del usuario libre. */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('users/me/bookings')
export class MyBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@Req() req: unknown) {
    return this.bookings.listForUser(auth(req).uid);
  }

  @Post()
  create(@Req() req: unknown, @Body() dto: CreateBookingDto) {
    const { uid, email } = auth(req);
    return this.bookings.create(uid, email, dto);
  }

  @Get(':id')
  get(@Req() req: unknown, @Param('id') id: string) {
    return this.bookings.getForUser(auth(req).uid, id);
  }

  @Post(':id/sync')
  sync(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: SyncBookingPaymentDto,
  ) {
    return this.bookings.syncForUser(auth(req).uid, id, dto.paymentId);
  }

  @Post(':id/cancel')
  cancel(@Req() req: unknown, @Param('id') id: string) {
    return this.bookings.cancelByUser(auth(req).uid, id);
  }
}

/** Consola del club: reservas recibidas. */
@Roles('admin', 'club_admin', 'manager', 'coordinator')
@Controller('clubs/:clubId/bookings')
export class ClubBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query() query: ClubBookingsQueryDto,
  ) {
    requireClubScope(req, clubId);
    return this.bookings.listForClub(
      requireCompanyId(req),
      clubId,
      query.from,
      query.to,
    );
  }

  @Post(':id/confirm')
  confirm(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    requireClubScope(req, clubId);
    return this.bookings.confirmByClub(requireCompanyId(req), clubId, id);
  }

  @Post(':id/cancel')
  cancel(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    requireClubScope(req, clubId);
    return this.bookings.cancelByClub(
      requireCompanyId(req),
      clubId,
      id,
      dto.reason,
    );
  }
}
