import { audienceTokens, chunk, normEmail } from './push-rules';

describe('push-rules', () => {
  const devices = [
    { token: 't-jugador', firebaseUid: 'u1', email: null },
    { token: 't-madre', firebaseUid: 'u2', email: 'Mama@Mail.com' },
    { token: 't-ajeno', firebaseUid: 'u3', email: 'otro@mail.com' },
    { token: 't-staff', firebaseUid: 'staff', email: null },
  ];

  it('incluye usuarios del club y tutores por email, sin ajenos', () => {
    const t = audienceTokens(devices, new Set(['u1', 'staff']), new Set([normEmail('mama@mail.com')]), 'staff');
    expect(t.sort()).toEqual(['t-jugador', 't-madre']);
  });

  it('no repite tokens', () => {
    const t = audienceTokens([...devices, devices[0]], new Set(['u1']), new Set());
    expect(t).toEqual(['t-jugador']);
  });

  it('parte en lotes de 500', () => {
    const parts = chunk(Array.from({ length: 1201 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([500, 500, 201]);
  });
});
