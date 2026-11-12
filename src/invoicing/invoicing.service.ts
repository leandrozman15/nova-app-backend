import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { EmailService, isEmailConfigured } from '../email/email.service';
import { decryptSecret, encryptSecret } from '../payments/token-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Sistemas360Client } from './sistemas360.client';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);
  private readonly api = new Sistemas360Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private async requireClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({ where: { id: clubId, companyId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found');
  }

  async status(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    const a = await this.prisma.clubInvoicingAccount.findUnique({ where: { clubId } });
    const recent = await this.prisma.paymentInvoice.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, paymentId: true, status: true, voucherType: true, pointOfSale: true, number: true, cae: true, pdfUrl: true, error: true, createdAt: true },
    });
    return {
      connected: Boolean(a),
      voucherType: a?.voucherType ?? 'factura_c',
      autoIssue: a?.autoIssue ?? true,
      recent,
    };
  }

  async connect(companyId: string, clubId: string, token: string, voucherType?: string) {
    await this.requireClub(companyId, clubId);
    const clean = token.trim().replace(/^Bearer\s+/i, '');
    await this.api.checkToken(clean);
    const data = { tokenEncrypted: encryptSecret(clean), ...(voucherType && { voucherType }) };
    await this.prisma.clubInvoicingAccount.upsert({
      where: { clubId },
      update: data,
      create: { companyId, clubId, ...data },
    });
    return this.status(companyId, clubId);
  }

  async update(companyId: string, clubId: string, input: { voucherType?: string; autoIssue?: boolean }) {
    await this.requireClub(companyId, clubId);
    const a = await this.prisma.clubInvoicingAccount.findUnique({ where: { clubId } });
    if (!a) throw new BadRequestException('Primero conectá Sistemas 360.');
    await this.prisma.clubInvoicingAccount.update({
      where: { clubId },
      data: {
        ...(input.voucherType && { voucherType: input.voucherType }),
        ...(input.autoIssue !== undefined && { autoIssue: input.autoIssue }),
      },
    });
    return this.status(companyId, clubId);
  }

  async disconnect(companyId: string, clubId: string) {
    await this.requireClub(companyId, clubId);
    await this.prisma.clubInvoicingAccount.deleteMany({ where: { clubId } });
    return { ok: true };
  }

  /** Emite el comprobante de un cobro (manual). Devuelve el comprobante guardado. */
  async issueManual(companyId: string, clubId: string, paymentId: string) {
    await this.requireClub(companyId, clubId);
    const p = await this.prisma.playerPayment.findFirst({ where: { id: paymentId, clubId, companyId } });
    if (!p) throw new NotFoundException('Payment not found');
    if (p.status !== 'paid') throw new BadRequestException('Solo se factura un cobro pagado.');
    const r = await this.issueForPayment(paymentId, true);
    if (!r) throw new BadRequestException('Conectá Sistemas 360 para facturar.');
    return r;
  }

  /** Emisión automática al cobrar. Nunca interrumpe el cobro: los errores solo se registran. */
  async issueForPayment(paymentId: string, force = false) {
    try {
      const p = await this.prisma.playerPayment.findUnique({
        where: { id: paymentId },
        include: { player: true, club: true },
      });
      if (!p || p.status !== 'paid') return null;
      const acc = await this.prisma.clubInvoicingAccount.findUnique({ where: { clubId: p.clubId } });
      if (!acc || (!acc.autoIssue && !force)) return null;

      const existing = await this.prisma.paymentInvoice.findUnique({ where: { paymentId } });
      if (existing && existing.status === 'autorizado') return existing;

      // Reserva: la restricción única evita emitir dos veces el mismo cobro.
      const row =
        existing ??
        (await this.prisma.paymentInvoice
          .create({ data: { companyId: p.companyId, clubId: p.clubId, paymentId, status: 'procesando', voucherType: acc.voucherType } })
          .catch(() => null));
      if (!row) return null;

      const token = decryptSecret(acc.tokenEncrypted);
      const name = `${p.player.firstName} ${p.player.lastName}`.trim();
      try {
        const r = await this.api.issue(token, {
          voucherType: acc.voucherType,
          externalRef: `fluxion_cuota_${p.id}`,
          description: `Cuota ${MONTHS[p.month - 1] ?? p.month} ${p.year} – ${p.club.name} (${name})`,
          amount: Number(p.amount),
          customerName: 'Consumidor Final',
          email: p.player.email,
          date: (p.paymentDate ?? new Date()).toISOString().slice(0, 10),
        });
        const saved = await this.prisma.paymentInvoice.update({
          where: { id: row.id },
          data: {
            externalId: r.externalId,
            status: r.status,
            pointOfSale: r.pointOfSale,
            number: r.number,
            cae: r.cae,
            caeDueDate: r.caeDueDate,
            pdfUrl: r.pdfUrl,
            qrUrl: r.qrUrl,
            error: r.status === 'autorizado' ? null : (r.message ?? null),
          },
        });
        if (saved.status === 'autorizado') await this.sendEmail(p, saved);
        return saved;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Factura del cobro ${paymentId}: ${msg}`);
        return await this.prisma.paymentInvoice.update({ where: { id: row.id }, data: { status: 'error', error: msg.slice(0, 500) } });
      }
    } catch (e) {
      this.logger.warn(`Factura ${paymentId}: ${String(e)}`);
      return null;
    }
  }

  private async sendEmail(
    p: { clubId: string; companyId: string; player: { email: string | null }; club: { name: string; email: string | null } },
    inv: { id: string; pdfUrl: string | null; number: number | null; pointOfSale: number | null },
  ) {
    try {
      if (!isEmailConfigured() || !p.player.email || !inv.pdfUrl) return;
      const s = await this.prisma.clubEmailSettings.findUnique({ where: { clubId: p.clubId } });
      if (!s?.invoices) return;
      try {
        await this.prisma.emailLog.create({ data: { companyId: p.companyId, clubId: p.clubId, kind: 'invoice', refId: inv.id, toEmail: p.player.email } });
      } catch {
        return;
      }
      const num = `${String(inv.pointOfSale ?? 0).padStart(5, '0')}-${String(inv.number ?? 0).padStart(8, '0')}`;
      const url = esc(inv.pdfUrl);
      await this.email.send({
        to: p.player.email,
        fromName: `${p.club.name} vía Fluxion`,
        replyTo: p.club.email ?? undefined,
        subject: `Tu factura ${num} – ${p.club.name}`,
        html: `<p>Hola, te enviamos la factura electrónica ${num} de ${esc(p.club.name)}.</p><p><a href="${url}">Ver / descargar la factura (PDF)</a></p>`,
        text: `Factura ${num} de ${p.club.name}: ${inv.pdfUrl}`,
      });
    } catch (e) {
      await this.prisma.emailLog.deleteMany({ where: { kind: 'invoice', refId: inv.id } }).catch(() => undefined);
      this.logger.warn(`Email de factura ${inv.id}: ${String(e)}`);
    }
  }

  async retry(companyId: string, clubId: string, invoiceId: string) {
    await this.requireClub(companyId, clubId);
    const inv = await this.prisma.paymentInvoice.findFirst({ where: { id: invoiceId, clubId, companyId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'autorizado') return inv;
    if (inv.status === 'error' || !inv.externalId) {
      await this.prisma.paymentInvoice.delete({ where: { id: inv.id } });
      const r = await this.issueForPayment(inv.paymentId, true);
      if (!r) throw new BadRequestException('Conectá Sistemas 360 para facturar.');
      return r;
    }
    const acc = await this.prisma.clubInvoicingAccount.findUnique({ where: { clubId } });
    if (!acc) throw new BadRequestException('Conectá Sistemas 360 para facturar.');
    const r = await this.api.retry(decryptSecret(acc.tokenEncrypted), inv.externalId);
    return this.prisma.paymentInvoice.update({
      where: { id: inv.id },
      data: { status: r.status, pointOfSale: r.pointOfSale, number: r.number, cae: r.cae, caeDueDate: r.caeDueDate, pdfUrl: r.pdfUrl, qrUrl: r.qrUrl },
    });
  }
}
