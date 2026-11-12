/** Plantillas de los emails automáticos (HTML simple y compatible con cualquier casilla). */
export type FeeEmailData = {
  clubName: string;
  playerName: string;
  month: number;
  year: number;
  amount: number;
  dueDate?: Date | null;
  paidAt?: Date | null;
  method?: string | null;
  receiptNumber?: string;
};

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const money = (n: number) =>
  `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const period = (d: FeeEmailData) => `${MONTHS[d.month - 1] ?? d.month} ${d.year}`;
const day = (d: Date) =>
  d.toLocaleDateString('es-AR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

const layout = (club: string, title: string, body: string) => `<!doctype html>
<html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0f5132;color:#fff;padding:20px 28px;font-size:13px;font-weight:bold;letter-spacing:.5px">${escapeHtml(club)}</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:11px">Enviado automáticamente por Fluxion Sport en nombre de ${escapeHtml(club)}. Si tenés dudas, respondé este mail y te contesta el club.</td></tr>
</table></td></tr></table></body></html>`;

const row = (k: string, v: string) =>
  `<tr><td style="padding:6px 0;color:#64748b;font-size:13px">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;font-weight:bold;font-size:14px">${escapeHtml(v)}</td></tr>`;

export function receiptEmail(d: FeeEmailData) {
  const subject = `Recibo de pago · ${period(d)} · ${d.clubName}`;
  const rows = [
    row('Socio/a', d.playerName),
    row('Concepto', `Cuota ${period(d)}`),
    row('Importe', money(d.amount)),
    d.paidAt ? row('Fecha de pago', day(d.paidAt)) : '',
    d.method ? row('Medio de pago', d.method) : '',
    d.receiptNumber ? row('N.º de recibo', d.receiptNumber) : '',
  ].join('');
  const html = layout(
    d.clubName,
    '¡Recibimos tu pago!',
    `<p style="font-size:14px">Gracias. Este es el comprobante de tu pago.</p><table width="100%" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${rows}</table><p style="font-size:12px;color:#64748b">Este recibo es un comprobante interno del club y no reemplaza una factura fiscal.</p>`,
  );
  const text = `Recibo de pago - ${d.clubName}\nSocio/a: ${d.playerName}\nCuota ${period(d)}: ${money(d.amount)}${d.paidAt ? `\nFecha: ${day(d.paidAt)}` : ''}${d.receiptNumber ? `\nRecibo: ${d.receiptNumber}` : ''}`;
  return { subject, html, text };
}

export function feeNoticeEmail(d: FeeEmailData) {
  const subject = `Tu cuota de ${period(d)} vence pronto · ${d.clubName}`;
  const html = layout(
    d.clubName,
    `Cuota de ${period(d)}`,
    `<p style="font-size:14px">Te recordamos que la cuota de <b>${escapeHtml(d.playerName)}</b> está por vencer.</p><table width="100%" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${row('Importe', money(d.amount))}${d.dueDate ? row('Vence', day(d.dueDate)) : ''}</table><p style="font-size:13px">Podés pagarla desde la app del club o en la secretaría. Si ya pagaste, ignorá este mensaje.</p>`,
  );
  const text = `${d.clubName}: la cuota de ${period(d)} de ${d.playerName} (${money(d.amount)}) ${d.dueDate ? `vence el ${day(d.dueDate)}` : 'está por vencer'}. Si ya pagaste, ignorá este mensaje.`;
  return { subject, html, text };
}

export function overdueEmail(d: FeeEmailData) {
  const subject = `Cuota de ${period(d)} vencida · ${d.clubName}`;
  const html = layout(
    d.clubName,
    `Cuota vencida: ${period(d)}`,
    `<p style="font-size:14px">Figura pendiente la cuota de <b>${escapeHtml(d.playerName)}</b>.</p><table width="100%" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${row('Importe', money(d.amount))}${d.dueDate ? row('Venció el', day(d.dueDate)) : ''}</table><p style="font-size:13px">Podés regularizarla desde la app del club o en la secretaría. Si ya pagaste, avisanos respondiendo este mail.</p>`,
  );
  const text = `${d.clubName}: la cuota de ${period(d)} de ${d.playerName} (${money(d.amount)}) está vencida. Podés regularizarla desde la app o en secretaría. Si ya pagaste, avisanos.`;
  return { subject, html, text };
}

export type WelcomeEmailData = { clubName: string; name: string; appUrl: string };

export function welcomeEmail(d: WelcomeEmailData) {
  const subject = `¡Bienvenido/a a ${d.clubName}!`;
  const html = layout(
    d.clubName,
    `¡Bienvenido/a, ${d.name}!`,
    `<p style="font-size:14px">Ya sos parte de <b>${escapeHtml(d.clubName)}</b>. Desde la app podés ver tu carnet, tus pagos y las novedades del club.</p><p style="margin:24px 0"><a href="${escapeHtml(d.appUrl)}" style="background:#0f5132;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;font-size:14px">Entrar a la app</a></p><p style="font-size:12px;color:#64748b">Si tenés dudas, respondé este mail y te contesta el club.</p>`,
  );
  const text = `¡Bienvenido/a a ${d.clubName}, ${d.name}! Entrá a la app: ${d.appUrl}`;
  return { subject, html, text };
}
