import { timingSafeEqual } from 'node:crypto';

import { Controller, ForbiddenException, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { BookingRemindersService } from './booking-reminders.service';

/** Cola de recordatorios por WhatsApp de los turnos del día (consola). */
@Roles('admin', 'club_admin', 'manager', 'coordinator')
@Controller('clubs/:clubId/booking-reminders')
export class BookingRemindersController {
  constructor(private readonly service: BookingRemindersService) {}

  private scope(req: unknown, clubId: string) {
    requireClubScope(req, clubId);
    return requireCompanyId(req);
  }

  @Get()
  list(@Req() req: unknown, @Param('clubId') clubId: string, @Query('date') date?: string) {
    return this.service.listForDay(this.scope(req, clubId), clubId, date);
  }

  @Post(':bookingId/whatsapp')
  markWhatsapp(@Req() req: unknown, @Param('clubId') clubId: string, @Param('bookingId') bookingId: string) {
    return this.service.markWhatsapp(this.scope(req, clubId), clubId, bookingId);
  }
}

/** Recordatorio automático (push) 3 horas antes: cron externo cada 15 minutos con `CRON_SECRET`. */
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('internal/booking-reminders')
export class BookingRemindersCronController {
  constructor(private readonly service: BookingRemindersService) {}

  @Post('run')
  run(@Headers('x-cron-secret') secret: string | undefined) {
    const expected = process.env.CRON_SECRET?.trim();
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected ?? '');
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException();
    return this.service.runPush();
  }
}
