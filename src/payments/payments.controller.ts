import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';

import { BookingsService } from '../bookings/bookings.service';
import { Public } from '../common/decorators/public.decorator';
import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { FeePaymentsService } from './fee-payments.service';
import { mpConfig } from './mercadopago.client';
import { PaymentAccountsService } from './payment-accounts.service';
import { isValidWebhookSignature } from './webhook-signature';

/** Conexión de la cuenta de Mercado Pago del club (consola). */
@Roles('admin', 'club_admin', 'manager')
@Controller('clubs/:clubId/payments/mercadopago')
export class ClubPaymentsController {
  constructor(private readonly accounts: PaymentAccountsService) {}

  @Get()
  status(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.accounts.status(requireCompanyId(req), clubId);
  }

  @Post('connect')
  connect(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.accounts.connectUrl(
      requireCompanyId(req),
      clubId,
      (req as RequestWithAuth).auth!.uid,
    );
  }

  @Delete()
  disconnect(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.accounts.disconnect(requireCompanyId(req), clubId);
  }
}

/** Pago online de la cuota de socio desde el portal (socio/jugador dueño de la cuota). */
@Roles('player', 'member')
@Controller('player-payments/:id/mercadopago')
export class FeePaymentsController {
  constructor(private readonly fees: FeePaymentsService) {}

  @Post('checkout')
  checkout(@Req() req: unknown, @Param('id') id: string) {
    return this.fees.createCheckout(
      requireCompanyId(req),
      (req as RequestWithAuth).auth!.uid,
      id,
      (req as RequestWithAuth).auth?.role,
    );
  }

  @Post('sync')
  @HttpCode(200)
  sync(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() body: { paymentId?: string },
  ) {
    return this.fees.syncForOwner(
      requireCompanyId(req),
      (req as RequestWithAuth).auth!.uid,
      id,
      String(body?.paymentId ?? ''),
    );
  }
}

/** Padre/tutor: sus hijos vinculados y el pago de sus cuotas (sin membresía de club propia). */
@NoTenant()
@Controller('users/me/children')
export class GuardianChildrenController {
  constructor(private readonly fees: FeePaymentsService) {}

  @Get()
  list(@Req() req: unknown) {
    return this.fees.listChildren((req as RequestWithAuth).auth!);
  }

  /** En vivo, próximos y últimos partidos de los clubes de mis hijos. */
  @Get('club-matches')
  clubMatches(@Req() req: unknown) {
    return this.fees.clubMatchesForGuardian((req as RequestWithAuth).auth!);
  }

  /** Torneos, tablas y fixture completo de los clubes de mis hijos. */
  @Get('competitions')
  competitions(@Req() req: unknown) {
    return this.fees.competitionsForGuardian((req as RequestWithAuth).auth!);
  }

  /** Carta (lista de precios) del buffet de los clubes de mis hijos. */
  @Get('buffet')
  buffetMenu(@Req() req: unknown) {
    return this.fees.buffetMenuForGuardian((req as RequestWithAuth).auth!);
  }

  @Get(':playerId/payments')
  payments(@Req() req: unknown, @Param('playerId') playerId: string) {
    return this.fees.listChildFees((req as RequestWithAuth).auth!, playerId);
  }

  @Post(':playerId/payments/:feeId/mercadopago/checkout')
  checkout(
    @Req() req: unknown,
    @Param('playerId') playerId: string,
    @Param('feeId') feeId: string,
  ) {
    return this.fees.checkoutForGuardian(
      (req as RequestWithAuth).auth!,
      playerId,
      feeId,
    );
  }

  @Post(':playerId/payments/:feeId/mercadopago/sync')
  @HttpCode(200)
  sync(
    @Req() req: unknown,
    @Param('playerId') playerId: string,
    @Param('feeId') feeId: string,
    @Body() body: { paymentId?: string },
  ) {
    return this.fees.syncForGuardian(
      (req as RequestWithAuth).auth!,
      playerId,
      feeId,
      String(body?.paymentId ?? ''),
    );
  }
}

/** Endpoints que llama Mercado Pago (públicos, sin token de Firebase). */
@Public()
@Controller('payments/mercadopago')
export class MercadoPagoCallbacksController {
  private readonly logger = new Logger(MercadoPagoCallbacksController.name);

  constructor(
    private readonly accounts: PaymentAccountsService,
    private readonly bookings: BookingsService,
    private readonly fees: FeePaymentsService,
  ) {}

  /** Vuelta del OAuth: guarda la cuenta y redirige a la consola del club. */
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const appUrl = mpConfig().publicAppUrl;
    try {
      const { clubId } = await this.accounts.handleCallback(code, state);
      return res.redirect(
        `${appUrl}/dashboard/clubs/${encodeURIComponent(clubId)}/settings?mercadopago=conectado`,
      );
    } catch (error) {
      this.logger.warn(`OAuth de Mercado Pago falló: ${String(error)}`);
      return res.redirect(`${appUrl}/dashboard?mercadopago=error`);
    }
  }

  /**
   * Notificaciones de pago. Responde 200 rápido; el estado real se consulta a la
   * API con el token del club (la notificación sola nunca confirma nada).
   */
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Query() query: Record<string, string | undefined>,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Req() req: unknown,
  ) {
    const body = ((req as { body?: unknown }).body ?? {}) as {
      type?: string;
      topic?: string;
      data?: { id?: string };
    };
    const type = query.type ?? query.topic ?? body.type ?? body.topic;
    const paymentId = query['data.id'] ?? body.data?.id ?? query.id;
    const bookingId = query.booking;
    const feeId = query.fee;

    const secret = mpConfig().webhookSecret;
    if (
      secret &&
      !isValidWebhookSignature({
        signatureHeader: signature,
        requestId,
        dataId: paymentId,
        secret,
      })
    ) {
      this.logger.warn(`Webhook con firma inválida (pago ${paymentId ?? '-'})`);
      return { ok: true };
    }
    if (
      type !== 'payment' ||
      !paymentId ||
      (!bookingId && !feeId) ||
      !/^\d{1,20}$/.test(String(paymentId))
    )
      return { ok: true };

    try {
      if (feeId) await this.fees.applyPayment(feeId, String(paymentId));
      else await this.bookings.applyPayment(bookingId!, String(paymentId));
    } catch (error) {
      // Mercado Pago reintenta si no respondemos 2xx: solo devolvemos error cuando
      // la falla es transitoria (su API no respondió); el resto se loguea.
      this.logger.warn(
        `Webhook pago ${paymentId} ${feeId ? `cuota ${feeId}` : `reserva ${bookingId}`}: ${String(error)}`,
      );
      if (error instanceof BadGatewayException) throw error;
    }
    return { ok: true };
  }
}
