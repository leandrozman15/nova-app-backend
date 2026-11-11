import { Injectable, Logger, Optional } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  feeNoticeEmail,
  overdueEmail,
  receiptEmail,
  type FeeEmailData,
} from './email-templates';
import { EmailService, isEmailConfigured } from './email.service';

export type EmailSettingsInput = {
  receipts?: boolean;
  invoices?: boolean;
  feeNotices?: boolean;
  overdue?: boolean;
};

/** Días antes del vencimiento en que se avisa la cuota. */
export const FEE_NOTICE_DAYS = 3;
const MAX_PER_RUN = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfTodayUtc = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

/** Avisos automáticos por email: recibos, aviso de cuota y mora, según lo que activa cada club. */
@Injectable()
export class EmailNotificationsService {
  private readonly logger = new Logger(EmailNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async getSettings(clubId: string) {
    const s = await this.prisma.clubEmailSettings.findUnique({ where: { clubId } });
    return {
      receipts: s?.receipts ?? false,
      invoices: s?.invoices ?? false,
      feeNotices: s?.feeNotices ?? false,
      overdue: s?.overdue ?? false,
    };
  }

  async updateSettings(companyId: string, clubId: string, input: EmailSettingsInput) {
    const data = {
      ...(input.receipts !== undefined && { receipts: input.receipts }),
      ...(input.invoices !== undefined && { invoices: input.invoices }),
      ...(input.feeNotices !== undefined && { feeNotices: input.feeNotices }),
      ...(input.overdue !== undefined && { overdue: input.overdue }),
    };
    await this.prisma.clubEmailSettings.upsert({
      where: { clubId },
      update: data,
      create: { companyId, clubId, ...data },
    });
    return this.getSettings(clubId);
  }

  private async deliver(
    kind: string,
    refId: string,
    companyId: string,
    clubId: string,
    to: string,
    clubName: string,
    replyTo: string | null | undefined,
    build: () => { subject: string; html: string; text: string },
  ): Promise<boolean> {
    // Reserva el envío primero: si dos procesos corren a la vez, solo uno lo manda.
    try {
      await this.prisma.emailLog.create({ data: { companyId, clubId, kind, refId, toEmail: to } });
    } catch {
      return false;
    }
    try {
      await this.email.send({ to, fromName: `${clubName} vía Fluxion`, replyTo: replyTo ?? undefined, ...build() });
      return true;
    } catch (e) {
      await this.prisma.emailLog.deleteMany({ where: { kind, refId } });
      this.logger.warn(`No se pudo enviar ${kind} ${refId}: ${String(e)}`);
      return false;
    }
  }

  private fee(p: {
    month: number;
    year: number;
    amount: unknown;
    dueDate: Date | null;
    paymentDate: Date | null;
    paymentMethod: string | null;
    id: string;
    player: { firstName: string; lastName: string };
    club: { name: string };
  }): FeeEmailData {
    return {
      clubName: p.club.name,
      playerName: `${p.player.firstName} ${p.player.lastName}`.trim(),
      month: p.month,
      year: p.year,
      amount: Number(p.amount),
      dueDate: p.dueDate,
      paidAt: p.paymentDate,
      method: p.paymentMethod,
      receiptNumber: p.id.slice(-8).toUpperCase(),
    };
  }

  /** Recibo al pagar una cuota. Nunca interrumpe el cobro: los errores solo se registran. */
  async notifyReceipt(paymentId: string): Promise<void> {
    try {
      if (!isEmailConfigured()) return;
      const p = await this.prisma.playerPayment.findUnique({
        where: { id: paymentId },
        include: { player: true, club: true },
      });
      if (!p || p.status !== 'paid' || !p.player.email) return;
      const settings = await this.getSettings(p.clubId);
      if (!settings.receipts) return;
      const data = this.fee(p);
      await this.deliver('receipt', p.id, p.companyId, p.clubId, p.player.email, p.club.name, p.club.email, () => receiptEmail(data));
    } catch (e) {
      this.logger.warn(`Recibo ${paymentId}: ${String(e)}`);
    }
  }

  /** Corrida diaria: avisa las cuotas por vencer y las vencidas (una vez cada una). */
  async runReminders() {
    if (!isEmailConfigured()) return { sent: 0, skipped: 'email_not_configured' };
    const clubs = await this.prisma.clubEmailSettings.findMany({
      where: { OR: [{ feeNotices: true }, { overdue: true }] },
    });
    const today = startOfTodayUtc();
    const soon = new Date(today.getTime() + (FEE_NOTICE_DAYS + 1) * DAY_MS);
    let sent = 0;
    for (const s of clubs) {
      if (sent >= MAX_PER_RUN) break;
      const payments = await this.prisma.playerPayment.findMany({
        where: {
          clubId: s.clubId,
          status: { not: 'paid' },
          dueDate: { not: null, lt: soon },
          player: { email: { not: null }, active: true },
        },
        include: { player: true, club: true },
        take: MAX_PER_RUN,
      });
      for (const p of payments) {
        if (sent >= MAX_PER_RUN) break;
        if (!p.dueDate || !p.player.email) continue;
        const isOverdue = p.dueDate.getTime() < today.getTime();
        const kind = isOverdue ? 'overdue' : 'fee-notice';
        if (isOverdue ? !s.overdue : !s.feeNotices) continue;
        const data = this.fee(p);
        const build = isOverdue ? () => overdueEmail(data) : () => feeNoticeEmail(data);
        if (await this.deliver(kind, p.id, p.companyId, p.clubId, p.player.email, p.club.name, p.club.email, build)) sent++;
      }
    }
    this.logger.log(`Avisos por email enviados: ${sent}`);
    return { sent };
  }
}
