import { displayWhatsapp, normalizeWhatsapp, whatsappLink } from './whatsapp';

describe('WhatsApp del club', () => {
  it.each([
    ['11 3046-4848', '5491130464848'],
    ['011 15 3046-4848', '5491130464848'],
    ['+54 9 11 3046-4848', '5491130464848'],
    ['+54 11 3046-4848', '5491130464848'],
    ['0351 15 512-3456', '5493515123456'],
    ['(0221) 4123456', '5492214123456'],
    ['+55 41 99999-8888', '5541999998888'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeWhatsapp(input)).toBe(expected);
  });

  it('rechaza números incompletos', () => {
    expect(normalizeWhatsapp('4848')).toBeNull();
    expect(normalizeWhatsapp('')).toBeNull();
  });

  it('muestra y arma el link', () => {
    expect(displayWhatsapp('5491130464848')).toBe('11 3046-4848');
    expect(displayWhatsapp('5493515123456')).toBe('351 512-3456');
    expect(displayWhatsapp('5541999998888')).toBe('+5541999998888');
    expect(whatsappLink('5491130464848', 'Hola, quiero reservar')).toBe(
      'https://wa.me/5491130464848?text=Hola%2C%20quiero%20reservar',
    );
  });
});
