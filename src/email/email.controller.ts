import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { EmailService } from './email.service';

/** Estado del envío de emails y mail de prueba (consola). */
@Roles('admin', 'club_admin', 'manager')
@Controller('clubs/:clubId/email')
export class ClubEmailController {
  constructor(private readonly service: EmailService) {}

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
