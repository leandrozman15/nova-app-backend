import { escapeHtml, feeNoticeEmail, overdueEmail, receiptEmail } from './email-templates';

const base = { clubName: 'Club <Demo>', playerName: 'Ana Pérez', month: 3, year: 2026, amount: 15000 };

describe('email templates', () => {
  it('escapa HTML en nombres', () => {
    expect(escapeHtml('<b>"x"</b>')).not.toContain('<b>');
    expect(receiptEmail(base).html).toContain('Club &#60;Demo&#62;');
  });
  it('recibo trae período e importe', () => {
    const r = receiptEmail({ ...base, paidAt: new Date('2026-03-05T12:00:00Z') });
    expect(r.subject).toContain('marzo 2026');
    expect(r.text).toContain('15.000,00');
    expect(r.html).toContain('05/03/2026');
  });
  it('aviso y mora usan la fecha de vencimiento', () => {
    const due = new Date('2026-03-10T12:00:00Z');
    expect(feeNoticeEmail({ ...base, dueDate: due }).text).toContain('10/03/2026');
    expect(overdueEmail({ ...base, dueDate: due }).subject).toContain('vencida');
  });
});

import { welcomeEmail } from './email-templates';

describe('welcomeEmail', () => {
  it('saluda por nombre, nombra el club y enlaza a la app', () => {
    const m = welcomeEmail({ clubName: 'Club <Demo>', name: 'Ana', appUrl: 'https://sport.fluxi-on.com' });
    expect(m.subject).toContain('Club <Demo>');
    expect(m.html).toContain('Ana');
    expect(m.html).toContain('Club &#60;Demo&#62;');
    expect(m.html).toContain('https://sport.fluxi-on.com');
    expect(m.text).toContain('https://sport.fluxi-on.com');
  });
});
