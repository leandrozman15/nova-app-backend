import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  AdjustStockDto,
  CloseSessionDto,
  CreateProductDto,
  CreateSaleDto,
  RegisterCanonDto,
  UpdateBuffetDto,
  UpdateProductDto,
} from './dto/buffet.dto';
import { BuffetMode, expectedCash, saleTotal, treasuryAmountForClose, treasuryCategory } from './buffet.logic';

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type Actor = { uid: string; name?: string };

@Injectable()
export class BuffetService {
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
    const sales = await this.prisma.buffetSale.findMany({
      where: { sessionId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    const completed = sales.filter((s) => s.status === 'completed');
    const byMethod: Record<string, number> = {};
    for (const s of completed) byMethod[s.paymentMethod] = round2((byMethod[s.paymentMethod] ?? 0) + num(s.total));
    const total = round2(completed.reduce((a, s) => a + num(s.total), 0));
    return {
      session,
      sales,
      totals: {
        total,
        count: completed.length,
        voided: sales.length - completed.length,
        byMethod,
        expectedCash: expectedCash(num(session.openingAmount), byMethod.cash ?? 0),
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
    const session = await this.currentSession(companyId, clubId);
    if (!session) throw new ConflictException('Abrí la caja antes de vender');

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

      const sale = await tx.buffetSale.create({
        data: {
          companyId,
          clubId,
          sessionId: session.id,
          total,
          paymentMethod: dto.paymentMethod,
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
        },
        include: { items: true },
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
    if (sale.session.status !== 'open') throw new ConflictException('No se puede anular una venta de una caja cerrada');

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
    const sales = await this.prisma.buffetSale.findMany({
      where: { companyId, clubId, status: 'completed', createdAt: { gte: from, lt: to } },
      include: { items: true },
    });
    const byDay: Record<string, { total: number; count: number }> = {};
    const byMethod: Record<string, number> = {};
    const byProduct = new Map<string, { name: string; quantity: number; revenue: number; cost: number }>();
    let revenue = 0;
    let cost = 0;
    for (const s of sales) {
      const day = s.createdAt.toISOString().slice(0, 10);
      byDay[day] = { total: round2((byDay[day]?.total ?? 0) + num(s.total)), count: (byDay[day]?.count ?? 0) + 1 };
      byMethod[s.paymentMethod] = round2((byMethod[s.paymentMethod] ?? 0) + num(s.total));
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
