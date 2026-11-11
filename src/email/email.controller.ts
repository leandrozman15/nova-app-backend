import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Put,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { timingSafeEqual } from 'node:crypto';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { EmailSettingsDto } from './dto/email-settings.dto';
import { EmailNotificationsService } from './email-notifications.service';
import { EmailService } from './email.service';

/** Estado del envío de emails y mail de prueba (consola). */
@Roles('admin', 'club_admin', 'manager')
@Controller('clubs/:clubId/email')
export class ClubEmailController {
  constructor(
    private readonly service: EmailService,
    private readonly notifications: EmailNotificationsService,
  ) {}

  /** Qué avisos automáticos tiene activados el club. */
  @Get('settings')
  settings(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.notifications.getSettings(clubId);
  }

  @Put('settings')
  updateSettings(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: EmailSettingsDto,
  ) {
    requireClubScope(req, clubId);
    return this.notifications.updateSettings(requireCompanyId(req), clubId, dto);
  }

  @Get()
  status(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.status();
  }

  /** Manda un mail de prueba solo al correo del usuario que lo pide. */
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('test')
  async test(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    const to = (req as RequestWithAuth).auth?.email;
    if (!to)
      throw new BadRequestException('Tu usuario no tiene un email asociado.');
    await this.service.send({
      to,
      subject: 'Prueba de email de Fluxion Sport',
      html: '<p>¡Funciona! Este es un mail de prueba enviado desde Fluxion Sport.</p>',
      text: '¡Funciona! Este es un mail de prueba enviado desde Fluxion Sport.',
    });
    return { sentTo: to };
  }
}

/** Corrida diaria de recordatorios: la dispara un cron externo con el secreto `CRON_SECRET`. */
@Public()
@Controller('internal/email')
export class EmailCronController {
  constructor(private readonly notifications: EmailNotificationsService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reminders')
  run(@Headers('x-cron-secret') secret: string | undefined) {
    const expected = process.env.CRON_SECRET?.trim();
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected ?? '');
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b))
      throw new ForbiddenException();
    return this.notifications.runReminders();
  }
}
