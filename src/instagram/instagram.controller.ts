import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PublishInstagramDto } from './dto/instagram.dto';
import { InstagramService } from './instagram.service';

const DEFAULT_PUBLIC_APP_URL = 'https://sport.fluxi-on.com';
const appUrl = () =>
  (process.env.PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL).replace(/\/$/, '');

/** Conexión y publicación en el Instagram del club (consola). */
@Roles('admin', 'club_admin', 'manager')
@Controller('clubs/:clubId/instagram')
export class ClubInstagramController {
  constructor(private readonly service: InstagramService) {}

  @Get()
  status(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.status(requireCompanyId(req), clubId);
  }

  @Post('connect')
  connect(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.connectUrl(
      requireCompanyId(req),
      clubId,
      (req as RequestWithAuth).auth!.uid,
    );
  }

  @Post('publish')
  publish(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: PublishInstagramDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.publish(requireCompanyId(req), clubId, dto);
  }

  @Delete()
  disconnect(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.disconnect(requireCompanyId(req), clubId);
  }
}

/** Vuelta del inicio de sesión de Instagram (pública: la firma del `state` valida el origen). */
@Public()
@Controller('instagram')
export class InstagramCallbackController {
  private readonly logger = new Logger(InstagramCallbackController.name);

  constructor(private readonly service: InstagramService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oauth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const back = (result: string) => {
      const clubId = this.service.clubIdFromState(state);
      return res.redirect(
        clubId
          ? `${appUrl()}/dashboard/clubs/${encodeURIComponent(clubId)}/settings/integraciones?open=instagram&instagram=${result}`
          : `${appUrl()}/dashboard?instagram=${result}`,
      );
    };
    if (error) return back('cancelado');
    try {
      const { clubId } = await this.service.handleCallback(code, state);
      return res.redirect(
        `${appUrl()}/dashboard/clubs/${encodeURIComponent(clubId)}/settings/integraciones?open=instagram&instagram=conectado`,
      );
    } catch (e) {
      this.logger.warn(`OAuth de Instagram falló: ${String(e)}`);
      return back(
        String(e).includes('SIN_CUENTA_PROFESIONAL') ? 'sin_cuenta' : 'error',
      );
    }
  }
}
