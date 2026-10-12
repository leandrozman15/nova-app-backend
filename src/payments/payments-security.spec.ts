import { createHmac } from 'node:crypto';

import {
  decryptSecret,
  encryptSecret,
  signState,
  verifyState,
} from './token-crypto';
import { isValidWebhookSignature } from './webhook-signature';

describe('token crypto', () => {
  beforeAll(() => {
    process.env.PAYMENT_TOKENS_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('round-trips and never stores the plain token', () => {
    const cipher = encryptSecret('APP_USR-secret-token');
    expect(cipher).not.toContain('APP_USR');
    expect(decryptSecret(cipher)).toBe('APP_USR-secret-token');
    expect(encryptSecret('x')).not.toBe(encryptSecret('x')); // IV aleatorio
  });

  it('detects tampering', () => {
    const cipher = encryptSecret('token');
    const tampered = cipher.slice(0, -2) + (cipher.endsWith('A') ? 'BB' : 'AA');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('signs and verifies the OAuth state', () => {
    const state = signState({ clubId: 'club-a', exp: 1 });
    expect(verifyState<{ clubId: string }>(state)?.clubId).toBe('club-a');
    const [body, sig] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({ clubId: 'club-b', exp: 1 }),
    ).toString('base64url');
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(verifyState(`${body}.x`)).toBeNull();
  });
});

describe('webhook signature', () => {
  const secret = 'webhook-secret';
  const sign = (manifest: string) =>
    createHmac('sha256', secret).update(manifest).digest('hex');

  it('accepts a valid signature', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = sign(`id:123456;request-id:req-1;ts:${ts};`);
    expect(
      isValidWebhookSignature({
        signatureHeader: `ts=${ts},v1=${v1}`,
        requestId: 'req-1',
        dataId: '123456',
        secret,
      }),
    ).toBe(true);
  });

  it('rejects wrong ids, old timestamps and missing headers', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = sign(`id:123456;request-id:req-1;ts:${ts};`);
    expect(
      isValidWebhookSignature({
        signatureHeader: `ts=${ts},v1=${v1}`,
        requestId: 'req-1',
        dataId: '999',
        secret,
      }),
    ).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const oldSig = sign(`id:123456;request-id:req-1;ts:${old};`);
    expect(
      isValidWebhookSignature({
        signatureHeader: `ts=${old},v1=${oldSig}`,
        requestId: 'req-1',
        dataId: '123456',
        secret,
      }),
    ).toBe(false);
    expect(
      isValidWebhookSignature({
        signatureHeader: undefined,
        dataId: '1',
        secret,
      }),
    ).toBe(false);
  });
});
