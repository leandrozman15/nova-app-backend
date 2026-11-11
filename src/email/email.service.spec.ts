import { senderDomain } from './email.service';

describe('senderDomain', () => {
  it('lee el dominio con y sin nombre', () => {
    expect(senderDomain('Club <avisos@fluxi-on.com>')).toBe('fluxi-on.com');
    expect(senderDomain('avisos@Fluxi-On.com')).toBe('fluxi-on.com');
    expect(senderDomain(undefined)).toBeNull();
  });
});
