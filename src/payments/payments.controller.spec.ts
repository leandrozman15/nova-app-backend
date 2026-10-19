import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';

import { PaymentAccountsService } from './payment-accounts.service';
import { MercadoPagoCallbacksController } from './payments.controller';
import { signState } from './token-crypto';

describe('MercadoPagoCallbacksController.webhook', () => {
  let bookings: any;
  let fees: any;
  let controller: MercadoPagoCallbacksController;
  const req = (body: unknown = {}) => ({ body });

  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = '';
    bookings = { applyPayment: jest.fn().mockResolvedValue(undefined) };
    fees = { applyPayment: jest.fn().mockResolvedValue(undefined) };
    controller = new MercadoPagoCallbacksController({} as any, bookings, fees);
  });

  it('applies payment notifications for the booking in the URL', async () => {
    await controller.webhook(
      { booking: 'b1', type: 'payment', 'data.id': '555' },
      undefined,
      undefined,
      req(),
    );
    expect(bookings.applyPayment).toHaveBeenCalledWith('b1', '555');
  });

  it('applies payment notifications for the fee in the URL, not the booking flow', async () => {
    await controller.webhook(
      { fee: 'f1', type: 'payment', 'data.id': '777' },
      undefined,
      undefined,
      req(),
    );
    expect(fees.applyPayment).toHaveBeenCalledWith('f1', '777');
    expect(bookings.applyPayment).not.toHaveBeenCalled();
  });

  it('ignores other topics, missing booking and malformed ids', async () => {
    await controller.webhook(
      { booking: 'b1', type: 'merchant_order', 'data.id': '1' },
      undefined,
      undefined,
      req(),
    );
    await controller.webhook(
      { type: 'payment', 'data.id': '1' },
      undefined,
      undefined,
      req(),
    );
    await controller.webhook(
      { booking: 'b1', type: 'payment', 'data.id': '1;drop' },
      undefined,
      undefined,
      req(),
    );
    expect(bookings.applyPayment).not.toHaveBeenCalled();
  });

  it('rejects bad signatures when a secret is configured', async () => {
    process.env.MP_WEBHOOK_SECRET = 'shh';
    const ts = String(Math.floor(Date.now() / 1000));
    await controller.webhook(
      { booking: 'b1', type: 'payment', 'data.id': '555' },
      `ts=${ts},v1=00`,
      'r',
      req(),
    );
    expect(bookings.applyPayment).not.toHaveBeenCalled();

    const v1 = createHmac('sha256', 'shh')
      .update(`id:555;request-id:r;ts:${ts};`)
      .digest('hex');
    await controller.webhook(
      { booking: 'b1', type: 'payment', 'data.id': '555' },
      `ts=${ts},v1=${v1}`,
      'r',
      req(),
    );
    expect(bookings.applyPayment).toHaveBeenCalledWith('b1', '555');
  });

  it('answers 200 for permanent errors but lets Mercado Pago retry transient ones', async () => {
    bookings.applyPayment.mockRejectedValueOnce(new NotFoundException());
    await expect(
      controller.webhook(
        { booking: 'x', type: 'payment', 'data.id': '1' },
        undefined,
        undefined,
        req(),
      ),
    ).resolves.toEqual({ ok: true });
    bookings.applyPayment.mockRejectedValueOnce(
      new BadGatewayException('Mercado Pago no respondió'),
    );
    await expect(
      controller.webhook(
        { booking: 'b1', type: 'payment', 'data.id': '1' },
        undefined,
        undefined,
        req(),
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('PaymentAccountsService.handleCallback', () => {
  let prisma: any;
  let mp: any;
  let service: PaymentAccountsService;

  beforeEach(() => {
    Object.assign(process.env, {
      MP_CLIENT_ID: 'id',
      MP_CLIENT_SECRET: 'secret',
      MP_REDIRECT_URI: 'https://api.test/cb',
      PUBLIC_API_URL: 'https://api.test',
      PUBLIC_APP_URL: 'https://app.test',
      PAYMENT_TOKENS_KEY: Buffer.alloc(32, 3).toString('base64'),
    });
    prisma = {
      club: {
        findFirst: jest.fn().mockResolvedValue({ id: 'club-a' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u-admin' }) },
      clubPaymentAccount: { upsert: jest.fn().mockResolvedValue({}) },
    };
    mp = {
      exchangeCode: jest.fn().mockResolvedValue({
        access_token: 'APP_USR-seller',
        refresh_token: 'TG-refresh',
        user_id: 123,
        public_key: 'APP_USR-pk',
        expires_in: 15552000,
        live_mode: false,
      }),
    };
    service = new PaymentAccountsService(prisma, mp);
  });

  it('stores the seller tokens encrypted for the club in the signed state', async () => {
    const state = signState({
      clubId: 'club-a',
      companyId: 'company-a',
      uid: 'fb-admin',
      exp: Date.now() + 60_000,
      nonce: 'n',
    });
    await expect(service.handleCallback('code-1', state)).resolves.toEqual({
      clubId: 'club-a',
    });
    const saved = prisma.clubPaymentAccount.upsert.mock.calls[0][0];
    expect(saved.where).toEqual({ clubId: 'club-a' });
    expect(saved.create.providerUserId).toBe('123');
    expect(saved.create.accessTokenEncrypted).not.toContain('APP_USR');
    expect(saved.create.refreshTokenEncrypted).not.toContain('TG-');
    // Conectar Mercado Pago activa la seña si el club no recibía reservas.
    expect(prisma.club.updateMany).toHaveBeenCalledWith({
      where: { id: 'club-a', bookingMode: 'off' },
      data: { bookingMode: 'deposit' },
    });
  });

  it('rejects forged or expired states before calling Mercado Pago', async () => {
    await expect(
      service.handleCallback('code', 'forged.state'),
    ).rejects.toBeInstanceOf(BadRequestException);
    const expired = signState({
      clubId: 'club-a',
      companyId: 'company-a',
      uid: 'u',
      exp: Date.now() - 1,
      nonce: 'n',
    });
    await expect(
      service.handleCallback('code', expired),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mp.exchangeCode).not.toHaveBeenCalled();
  });
});
