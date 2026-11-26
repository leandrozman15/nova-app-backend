import { randomUUID } from 'crypto';

import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  AdjustStockDto,
  CloseSessionDto,
  CreateProductDto,
  CreateSaleDto,
  RegisterCanonDto,
  SettleAccountDto,
  UpdateBuffetDto,
  UpdateProductDto,
} from './dto/buffet.dto';
import { minuteLabel } from '../bookings/booking-time';
import {
  BuffetMode,
  PaymentLine,
  bookingMethodOf,
  courtBalance,
  expectedCash,
  mergePayments,
  saleMethodOf,
  saleTotal,
  sumPayments,
  takeFromPool,
  toPublicMenu,
  treasuryAmountForClose,
  treasuryCategory,
} from './buffet.logic';

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type Actor = { uid: string; name?: string };

/** Datos del alquiler que se muestran junto a un consumo cargado a su cuenta. */
const ACCOUNT_LABEL_SELECT = {
  contactName: true,
  startMinute: true,
  facility: { select: { name: true } },
  user: { select: { name: true } },
} satisfies Prisma.BookingSelect;

type AccountLabelRow = Prisma.BookingGetPayload<{ select: typeof ACCOUNT_LABEL_SELECT }>;

const COURT_METHOD_LABEL: Record<string, string> = {
  cash: 'efectivo',
  transfer: 'transferencia',
  card: 'tarjeta',
  mercadopago: 'Mercado Pago',
};

/** Alquiler con sus consumos sin cobrar, para armar la cuenta. */
const ACCOUNT_SELECT = {
  id: true,
  date: true,
  startMinute: true,
  durationMinutes: true,
  price: true,
  paidAmount: true,
  contactName: true,
  facility: { select: { name: true } },
  user: { select: { name: true } },
  buffetSales: {
    where: { accountStatus: 'pending', status: 'completed' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      total: true,
      createdAt: true,
      createdByName: true,
      items: { select: { name: true, quantity: true, unitPrice: true } },
    },
  },
} satisfies Prisma.BookingSelect;

type AccountRow = Prisma.BookingGetPayload<{ select: typeof ACCOUNT_SELECT }>;

function presentAccount(b: AccountRow) {
  const price = num(b.price);
  const paid = num(b.paidAmount);
  const consumptions = b.buffetSales.map((s) => ({
    saleId: s.id,
    createdAt: s.createdAt,
    total: num(s.total),
    createdByName: s.createdByName,
    items: s.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: num(i.unitPrice) })),
  }));
  const consumptionTotal = round2(consumptions.reduce((a, c) => a + c.total, 0));
  const balance = courtBalance(price, paid);
  return {
    bookingId: b.id,
    name: b.contactName ?? b.user?.name ?? 'Sin nombre',
    facilityName: b.facility?.name ?? 'Cancha',
    date: b.date,
    startMinute: b.startMinute,
    label: `${minuteLabel(b.startMinute)} a ${minuteLabel(b.startMinute + b.durationMinutes)}`,
    courtPrice: price,
    courtPaid: paid,
    /** Lo que falta pagar de la cancha. */
    courtBalance: balance,
    consumptions,
    consumptionTotal,
    /** Total para cerrar la cuenta: consumos sin cobrar + saldo de la cancha. */
    due: round2(consumptionTotal + balance),
  };
}

const accountLabel = (b: AccountLabelRow) => ({
  name: b.contactName ?? b.user?.name ?? 'Sin nombre',
  facilityName: b.facility?.name ?? 'Cancha',
  time: minuteLabel(b.startMinute),
});


@Injectable()
export class BuffetService {
  private readonly logger = new Logger(BuffetService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async assertClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({ where: { id: clubId, companyId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club no encontrado');
  }

  // ─── Configuración ──────────────────────────────────────────────────
  async getBuffet(companyId: string, clubId: string) {
    await this.assertClub(companyId, clubId);
    const existing = await this.prisma.buffet.findUnique({ where: { clubId } });
    if (existing) return existing;
    return this.prisma.buffet.create({ data: { companyId, clubId } });
  }

  /** Carta de solo lectura para atletas, entrenadores, coordinadores y directores (sin costos ni stock). */
  async publicMenu(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({ where: { id: clubId, companyId }, select: { id: true, name: true } });
    if (!club) throw new NotFoundException('Club no encontrado');
    const buffet = await this.prisma.buffet.findUnique({ where: { clubId } });
    if (!buffet || !buffet.active) return null;
    const [products, openSession] = await Promise.all([
      this.prisma.buffetProduct.findMany({ where: { companyId, clubId, active: true } }),
      this.prisma.buffetCashSession.findFirst({ where: { companyId, clubId, status: 'open' }, select: { id: true } }),
    ]);
    const items = toPublicMenu(products);
    if (items.length === 0) return null;
    return {
      clubId,
      clubName: club.name,
      buffetName: buffet.name,
      concessionaire: buffet.concessionaire ?? null,
      open: !!openSession,
      products: items,
    };
  }

  async updateBuffet(companyId: string, clubId: string, dto: UpdateBuffetDto) {
    await this.getBuffet(companyId, clubId);
    if (dto.mode === 'percent' && (dto.percent == null || dto.percent <= 0)) {
      throw new BadRequestException('Indicá el porcentaje que le corresponde al club');
    }
    if (dto.mode === 'canon' && (dto.canonAmount == null || dto.canonAmount <= 0)) {
      throw new BadRequestException('Indicá el importe del canon');
    }
    return this.prisma.buffet.update({ where: { clubId }, data: dto });
  }

  // ─── Productos y stock ──────────────────────────────────────────────
  listProducts(companyId: string, clubId: string, includeInactive: boolean) {
    return this.prisma.buffetProduct.findMany({
      where: { companyId, clubId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createProduct(companyId: string, clubId: string, actor: Actor, dto: CreateProductDto) {
    await this.assertClub(companyId, clubId);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.buffetProduct.create({
        data: {
          companyId,
          clubId,
          name: dto.name.trim(),
          category: dto.category?.trim() || 'General',
          price: dto.price,
          cost: dto.cost ?? 0,
          stock: dto.stock ?? 0,
          minStock: dto.minStock ?? 0,
          trackStock: dto.trackStock ?? true,
          imageUrl: dto.imageUrl ?? null,
        },
      });
      if ((dto.stock ?? 0) > 0) {
        await tx.buffetStockMovement.create({
          data: { companyId, clubId, productId: product.id, delta: dto.stock!, reason: 'purchase', note: 'Stock inicial', createdByUid: actor.uid },
        });
      }
      return product;
    });
  }

  async updateProduct(companyId: string, clubId: string, id: string, dto: UpdateProductDto) {
    await this.ensureProduct(companyId, clubId, id);
    return this.prisma.buffetProduct.update({ where: { id }, data: dto });
  }

  async deleteProducts(companyId: string, clubId: string, ids: string[]) {
    await this.assertClub(companyId, clubId);
    const products = await this.prisma.buffetProduct.findMany({
      where: { companyId, clubId, id: { in: ids } },
      select: { id: true, _count: { select: { saleItems: true } } },
    });
    const withSales = products.filter((p) => p._count.saleItems > 0).map((p) => p.id);
    const clean = products.filter((p) => p._count.saleItems === 0).map((p) => p.id);
    if (clean.length) await this.prisma.buffetProduct.deleteMany({ where: { id: { in: clean } } });
    if (withSales.length) await this.prisma.buffetProduct.updateMany({ where: { id: { in: withSales } }, data: { active: false } });
    return { deleted: clean.length, archived: withSales.length };
  }

  async adjustStock(companyId: string, clubId: string, id: string, actor: Actor, dto: AdjustStockDto) {
    const product = await this.ensureProduct(companyId, clubId, id);
    if (dto.delta === 0) throw new BadRequestException('El ajuste no puede ser 0');
    if (product.stock + dto.delta < 0) throw new BadRequestException('El stock no puede quedar negativo');
    const [updated] = await this.prisma.$transaction([
      this.prisma.buffetProduct.update({ where: { id }, data: { stock: { increment: dto.delta } } }),
      this.prisma.buffetStockMovement.create({
        data: { companyId, clubId, productId: id, delta: dto.delta, reason: dto.reason, note: dto.note, createdByUid: actor.uid },
      }),
    ]);
    return updated;
  }

  listMovements(companyId: string, clubId: string, productId?: string) {
    return this.prisma.buffetStockMovement.findMany({
      where: { companyId, clubId, ...(productId ? { productId } : {}) },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async ensureProduct(companyId: string, clubId: string, id: string) {
    const product = await this.prisma.buffetProduct.findFirst({ where: { id, companyId, clubId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  // ─── Caja ───────────────────────────────────────────────────────────
  currentSession(companyId: string, clubId: string) {
    return this.prisma.buffetCashSession.findFirst({ where: { companyId, clubId, status: 'open' }, orderBy: { openedAt: 'desc' } });
  }

  async openSession(companyId: string, clubId: string, actor: Actor, openingAmount: number) {
    const buffet = await this.getBuffet(companyId, clubId);
    if (!buffet.active) throw new BadRequestException('El buffet está desactivado');
    if (await this.currentSession(companyId, clubId)) throw new ConflictException('Ya hay una caja abierta');
    return this.prisma.buffetCashSession.create({
      data: { companyId, clubId, openedByUid: actor.uid, openedByName: actor.name, openingAmount },
    });
  }

  async sessionSummary(companyId: string, clubId: string, sessionId: string) {
    const session = await this.prisma.buffetCashSession.findFirst({ where: { id: sessionId, companyId, clubId } });
    if (!session) throw new NotFoundException('Caja no encontrada');
    const [sales, payments] = await Promise.all([
      this.prisma.buffetSale.findMany({
        where: { sessionId },
        include: { items: true, payments: true, booking: { select: ACCOUNT_LABEL_SELECT } },
        orderBy: { createdAt: 'desc' },
      }),
      // Lo cobrado en esta caja, incluso consumos de alquileres cargados en otra caja y cobrados hoy.
      this.prisma.buffetSalePayment.findMany({ where: { sessionId, sale: { status: 'completed' } } }),
    ]);
    const completed = sales.filter((s) => s.status === 'completed');
    const byMethod: Record<string, number> = {};
    for (const p of payments) byMethod[p.method] = round2((byMethod[p.method] ?? 0) + num(p.amount));
    const total = round2(payments.reduce((a, p) => a + num(p.amount), 0));
    const onAccount = completed.filter((s) => s.accountStatus === 'pending');
    return {
      session,
      sales: sales.map((s) => ({ ...s, booking: s.booking ? accountLabel(s.booking) : null })),
      totals: {
        /** Lo efectivamente cobrado en esta caja. */
        total,
        count: completed.length,
        voided: sales.length - completed.length,
        byMethod,
        expectedCash: expectedCash(num(session.openingAmount), byMethod.cash ?? 0),
        /** Consumos cargados a alquileres en esta caja que todavía no se cobraron. */
        onAccount: round2(onAccount.reduce((a, s) => a + num(s.total), 0)),
      },
    };
  }

  async closeSession(companyId: string, clubId: string, sessionId: string, actor: Actor, dto: CloseSessionDto) {
    const buffet = await this.getBuffet(companyId, clubId);
    const summary = await this.sessionSummary(companyId, clubId, sessionId);
    if (summary.session.status !== 'open') throw new ConflictException('La caja ya está cerrada');

    const expected = summary.totals.expectedCash;
    const difference = round2(dto.countedCash - expected);
    const mode = buffet.mode as BuffetMode;
    const amount = dto.reportToTreasury ? treasuryAmountForClose(mode, summary.totals.total, buffet.percent ? Number(buffet.percent) : null) : 0;

    return this.prisma.$transaction(async (tx) => {
      let treasuryId: string | null = null;
      if (dto.reportToTreasury && amount > 0) {
        const trx = await tx.financialTransaction.create({
          data: {
            companyId,
            clubId,
            type: 'income',
            category: treasuryCategory(mode),
            amount,
            occurredAt: new Date(),
            description: `Cierre de caja buffet${buffet.concessionaire ? ` (${buffet.concessionaire})` : ''} · ventas ${summary.totals.total.toFixed(2)}`,
            reference: `buffet-caja-${sessionId}`,
          },
        });
        treasuryId = trx.id;
      }
      return tx.buffetCashSession.update({
        where: { id: sessionId },
        data: {
          status: 'closed',
          closedAt: new Date(),
          closedByUid: actor.uid,
          expectedCash: expected,
          countedCash: dto.countedCash,
          difference,
          salesTotal: summary.totals.total,
          note: dto.note,
          reportedToTreasury: treasuryId != null,
          treasuryAmount: treasuryId ? amount : null,
          treasuryTransactionId: treasuryId,
        },
      });
    });
  }

  listSessions(companyId: string, clubId: string) {
    return this.prisma.buffetCashSession.findMany({ where: { companyId, clubId }, orderBy: { openedAt: 'desc' }, take: 60 });
  }

  // ─── Ventas ─────────────────────────────────────────────────────────
  async createSale(companyId: string, clubId: string, actor: Actor, dto: CreateSaleDto) {
    if (dto.clientRef) {
      const prev = await this.prisma.buffetSale.findFirst({
        where: { companyId, clubId, clientRef: dto.clientRef },
        include: { items: true },
      });
      if (prev) return prev;
    }
    try {
      return await this.createSaleOnce(companyId, clubId, actor, dto);
    } catch (e: any) {
      // Dos reenvíos simultáneos: gana el primero, el otro devuelve esa misma venta.
      if (e?.code === 'P2002' && dto.clientRef) {
        const prev = await this.prisma.buffetSale.findFirst({
          where: { companyId, clubId, clientRef: dto.clientRef },
          include: { items: true },
        });
        if (prev) return prev;
      }
      throw e;
    }
  }

  private async createSaleOnce(companyId: string, clubId: string, actor: Actor, dto: CreateSaleDto) {
    const chosen = [dto.paymentMethod, dto.payments?.length ? 1 : null, dto.bookingId].filter(Boolean).length;
    if (chosen === 0) throw new BadRequestException('Indicá cómo se cobra la venta');
    if (chosen > 1) throw new BadRequestException('Elegí una sola forma de cobro: un medio, pago dividido o a cuenta de un alquiler');

    const session = await this.currentSession(companyId, clubId);
    if (!session) throw new ConflictException('Abrí la caja antes de vender');
    if (dto.bookingId) await this.requireAccountBooking(companyId, clubId, dto.bookingId);

    // Unifica líneas repetidas del mismo producto.
    const qtyById = new Map<string, number>();
    for (const i of dto.items) qtyById.set(i.productId, (qtyById.get(i.productId) ?? 0) + i.quantity);

    return this.prisma.$transaction(async (tx) => {
      const products = await tx.buffetProduct.findMany({
        where: { id: { in: [...qtyById.keys()] }, companyId, clubId, active: true },
      });
      if (products.length !== qtyById.size) throw new BadRequestException('Hay productos inexistentes o inactivos');

      const lines = products.map((p) => ({ product: p, quantity: qtyById.get(p.id)! }));
      for (const { product, quantity } of lines) {
        if (product.trackStock && product.stock < quantity) {
          throw new BadRequestException(`Stock insuficiente de ${product.name} (quedan ${product.stock})`);
        }
      }
      const total = saleTotal(lines.map((l) => ({ quantity: l.quantity, unitPrice: num(l.product.price) })));

      // A cuenta de un alquiler: no entra plata ahora, se cobra al cerrar la cuenta.
      let payments: PaymentLine[] = [];
      if (!dto.bookingId) {
        payments = mergePayments(dto.payments?.length ? dto.payments : [{ method: dto.paymentMethod!, amount: total }]);
        const paid = sumPayments(payments);
        if (Math.abs(paid - total) > 0.009) {
          throw new BadRequestException(`Los pagos suman ${paid} y la venta es de ${total}`);
        }
      }

      const sale = await tx.buffetSale.create({
        data: {
          companyId,
          clubId,
          sessionId: session.id,
          total,
          paymentMethod: dto.bookingId ? 'account' : saleMethodOf(payments),
          bookingId: dto.bookingId,
          accountStatus: dto.bookingId ? 'pending' : null,
          clientRef: dto.clientRef,
          createdByUid: actor.uid,
          createdByName: actor.name,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              name: l.product.name,
              quantity: l.quantity,
              unitPrice: l.product.price,
              unitCost: l.product.cost,
            })),
          },
          payments: dto.bookingId ? undefined : { create: payments.map((p) => ({ sessionId: session.id, method: p.method, amount: p.amount })) },
        },
        include: { items: true, payments: true },
      });
      for (const { product, quantity } of lines) {
        if (!product.trackStock) continue;
        await tx.buffetProduct.update({ where: { id: product.id }, data: { stock: { decrement: quantity } } });
        await tx.buffetStockMovement.create({
          data: { companyId, clubId, productId: product.id, delta: -quantity, reason: 'sale', saleId: sale.id, createdByUid: actor.uid },
        });
      }
      return sale;
    });
  }

  async voidSale(companyId: string, clubId: string, saleId: string, actor: Actor, reason: string) {
    const sale = await this.prisma.buffetSale.findFirst({
      where: { id: saleId, companyId, clubId },
      include: { items: true, session: { select: { status: true } } },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status !== 'completed') throw new ConflictException('La venta ya está anulada');
    if (sale.accountStatus === 'settled') {
      throw new ConflictException('Este consumo ya se cobró al cerrar la cuenta del alquiler');
    }
    // Un consumo a cuenta todavía no movió plata: se puede sacar de la cuenta aunque su caja ya esté cerrada.
    if (sale.accountStatus !== 'pending' && sale.session.status !== 'open') {
      throw new ConflictException('No se puede anular una venta de una caja cerrada');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.buffetSale.update({ where: { id: saleId }, data: { status: 'voided', voidReason: reason, voidedAt: new Date() } });
      for (const item of sale.items) {
        if (!item.productId) continue;
        const product = await tx.buffetProduct.findUnique({ where: { id: item.productId }, select: { trackStock: true } });
        if (!product?.trackStock) continue;
        await tx.buffetProduct.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        await tx.buffetStockMovement.create({
          data: { companyId, clubId, productId: item.productId, delta: item.quantity, reason: 'void', saleId, note: reason, createdByUid: actor.uid },
        });
      }
      return { ok: true };
    });
  }

  // ─── Cuentas de alquiler ────────────────────────────────────────────
  // Los consumos de quien alquiló una cancha se cargan a su cuenta y se cobran juntos, con el saldo
  // de la cancha, al cerrarla. Hasta entonces no entran a la caja ni a Tesorería.

  private async requireAccountBooking(companyId: string, clubId: string, id: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id, companyId, clubId, kind: 'ALQUILER', status: 'CONFIRMED' },
      select: { id: true },
    });
    if (!b) throw new BadRequestException('Ese alquiler no existe o ya no está confirmado');
    return b;
  }

  /**
   * Alquileres a los que se les puede cargar consumo: los del día indicado y cualquiera con consumos sin cobrar
   * (una cuenta que quedó abierta de otro día sigue apareciendo hasta que se cierre).
   */
  async listAccounts(companyId: string, clubId: string, date: string) {
    const rows = await this.prisma.booking.findMany({
      where: {
        companyId,
        clubId,
        kind: 'ALQUILER',
        status: 'CONFIRMED',
        OR: [{ date }, { buffetSales: { some: { accountStatus: 'pending', status: 'completed' } } }],
      },
      select: ACCOUNT_SELECT,
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      take: 200,
    });
    return rows.map(presentAccount);
  }

  async getAccount(companyId: string, clubId: string, bookingId: string) {
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, companyId, clubId, kind: 'ALQUILER', status: 'CONFIRMED' },
      select: ACCOUNT_SELECT,
    });
    if (!row) throw new NotFoundException('Alquiler no encontrado');
    return presentAccount(row);
  }

  /**
   * Cierra la cuenta: cobra los consumos pendientes y el saldo de la cancha con los medios indicados.
   * Lo pagado se reparte primero a los consumos (en la caja abierta del buffet) y el resto al turno (Tesorería).
   */
  async settleAccount(companyId: string, clubId: string, bookingId: string, dto: SettleAccountDto) {
    const account = await this.getAccount(companyId, clubId, bookingId);
    if (account.due <= 0) throw new ConflictException('La cuenta no tiene nada para cobrar');

    const payments = mergePayments(dto.payments);
    const paid = sumPayments(payments);
    if (Math.abs(paid - account.due) > 0.009) {
      throw new BadRequestException(`Los pagos suman ${paid} y la cuenta es de ${account.due}`);
    }

    const session = account.consumptions.length > 0 ? await this.currentSession(companyId, clubId) : null;
    if (account.consumptions.length > 0 && !session) {
      throw new ConflictException('Abrí la caja del buffet antes de cobrar los consumos de la cuenta');
    }

    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { attendance: true, currency: true, facilityId: true, date: true, startMinute: true, contactName: true },
    });

    const pool = payments.map((p) => ({ ...p }));
    const courtLines: PaymentLine[] = [];
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const c of account.consumptions) {
        const lines = takeFromPool(pool, c.total);
        await tx.buffetSalePayment.createMany({
          data: lines.map((l) => ({ saleId: c.saleId, sessionId: session!.id, method: l.method, amount: l.amount })),
        });
        await tx.buffetSale.update({ where: { id: c.saleId }, data: { accountStatus: 'settled', settledAt: now } });
      }
      courtLines.push(...takeFromPool(pool, account.courtBalance));
      if (account.courtBalance > 0) {
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            paidAmount: { increment: account.courtBalance },
            paymentMethod: bookingMethodOf(courtLines),
            attendance: booking.attendance ?? 'SHOWED',
          },
        });
      }
    });

    // Tesorería no debe frenar el cierre de la cuenta (igual que en la agenda).
    for (const l of courtLines) {
      try {
        await this.prisma.financialTransaction.create({
          data: {
            companyId,
            clubId,
            type: 'income',
            category: 'Alquiler de canchas',
            amount: l.amount,
            currency: booking.currency,
            occurredAt: new Date(),
            description: [
              `Turno (${COURT_METHOD_LABEL[l.method] ?? 'otro medio'}) · cuenta con buffet`,
              account.facilityName,
              `${account.date.slice(8, 10)}/${account.date.slice(5, 7)} ${minuteLabel(account.startMinute)}`,
              account.name,
            ].join(' · '),
            reference: `turno-pago:${bookingId}:${randomUUID()}`,
          },
        });
      } catch (error) {
        this.logger.error(`No se registró en Tesorería el cobro del turno ${bookingId}: ${String(error)}`);
      }
    }

    return { ok: true, collected: account.due, consumptions: account.consumptionTotal, court: account.courtBalance };
  }

  // ─── Canon (buffet tercerizado) ─────────────────────────────────────
  async registerCanon(companyId: string, clubId: string, dto: RegisterCanonDto) {
    const buffet = await this.getBuffet(companyId, clubId);
    if (buffet.mode !== 'canon') throw new BadRequestException('El buffet no está configurado con canon');
    const amount = dto.amount ?? num(buffet.canonAmount);
    if (amount <= 0) throw new BadRequestException('Indicá el importe del canon');
    const reference = `buffet-canon-${clubId}-${dto.period}`;
    const dup = await this.prisma.financialTransaction.findFirst({ where: { companyId, clubId, reference }, select: { id: true } });
    if (dup) throw new ConflictException(`El canon de ${dto.period} ya fue registrado en Tesorería`);
    return this.prisma.financialTransaction.create({
      data: {
        companyId,
        clubId,
        type: 'income',
        category: 'Buffet - canon',
        amount,
        occurredAt: new Date(),
        description: `Canon buffet ${dto.period}${buffet.concessionaire ? ` (${buffet.concessionaire})` : ''}`,
        reference,
      },
    });
  }

  // ─── Reportes ───────────────────────────────────────────────────────
  async report(companyId: string, clubId: string, from: Date, to: Date) {
    const [sales, payments] = await Promise.all([
      this.prisma.buffetSale.findMany({
        where: { companyId, clubId, status: 'completed', createdAt: { gte: from, lt: to } },
        include: { items: true },
      }),
      // Lo cobrado en el período, por medio de pago (un consumo a cuenta cuenta cuando se cobra).
      this.prisma.buffetSalePayment.findMany({
        where: { createdAt: { gte: from, lt: to }, sale: { companyId, clubId, status: 'completed' } },
      }),
    ]);
    const byDay: Record<string, { total: number; count: number }> = {};
    const byMethod: Record<string, number> = {};
    const byProduct = new Map<string, { name: string; quantity: number; revenue: number; cost: number }>();
    let revenue = 0;
    let cost = 0;
    for (const p of payments) byMethod[p.method] = round2((byMethod[p.method] ?? 0) + num(p.amount));
    const pending = sales.filter((s) => s.accountStatus === 'pending').reduce((a, s) => a + num(s.total), 0);
    if (pending > 0) byMethod.account = round2(pending);
    for (const s of sales) {
      const day = s.createdAt.toISOString().slice(0, 10);
      byDay[day] = { total: round2((byDay[day]?.total ?? 0) + num(s.total)), count: (byDay[day]?.count ?? 0) + 1 };
      revenue += num(s.total);
      for (const i of s.items) {
        const key = i.productId ?? i.name;
        const row = byProduct.get(key) ?? { name: i.name, quantity: 0, revenue: 0, cost: 0 };
        row.quantity += i.quantity;
        row.revenue = round2(row.revenue + i.quantity * num(i.unitPrice));
        row.cost = round2(row.cost + i.quantity * num(i.unitCost));
        cost += i.quantity * num(i.unitCost);
        byProduct.set(key, row);
      }
    }
    const lowStock = (await this.prisma.buffetProduct.findMany({ where: { companyId, clubId, active: true, trackStock: true } }))
      .filter((p) => p.stock <= p.minStock)
      .map((p) => ({ id: p.id, name: p.name, stock: p.stock, minStock: p.minStock }));

    return {
      totals: { revenue: round2(revenue), cost: round2(cost), margin: round2(revenue - cost), count: sales.length },
      byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
      byMethod,
      byProduct: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).map((r) => ({ ...r, margin: round2(r.revenue - r.cost) })),
      lowStock,
    };
  }
}
