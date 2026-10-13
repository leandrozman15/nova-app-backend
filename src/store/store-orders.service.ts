import { randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type StoreOrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CLUB_IN_GOOD_STANDING } from '../subscriptions/club-access';
import { split } from './commission';
import { CommissionsService } from './commissions.service';
import type { CreateStoreOrderDto } from './dto/store.dto';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function orderCode() {
  let code = 'FX-';
  for (let index = 0; index < 6; index += 1)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export const pickupCode = () =>
  String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Comienzo del día de hoy en la zona horaria del club. */
export function startOfToday(timeZone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) -
      offset,
  );
}

type ClubSize = { label: string; stock?: number };

function clubSizes(value: Prisma.JsonValue | null): ClubSize[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === 'object' && 'label' in item
      ? [
          {
            label: String((item as Record<string, unknown>).label),
            stock:
              typeof (item as Record<string, unknown>).stock === 'number'
                ? ((item as Record<string, unknown>).stock as number)
                : undefined,
          },
        ]
      : [],
  );
}

export function firstImage(value: Prisma.JsonValue | null): string | null {
  if (!Array.isArray(value)) return null;
  const first = value.find((item) => typeof item === 'string');
  return typeof first === 'string' ? first : null;
}

const ORDER_SELECT = {
  id: true,
  code: true,
  status: true,
  sellerType: true,
  buyerName: true,
  buyerPhone: true,
  notes: true,
  subtotal: true,
  currency: true,
  paymentMode: true,
  platformPercent: true,
  clubPercent: true,
  platformAmount: true,
  clubAmount: true,
  sellerAmount: true,
  commissionStatus: true,
  confirmedAt: true,
  receivedAtClubAt: true,
  deliveredAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  merchant: { select: { id: true, tradeName: true, contactPhone: true } },
  sellerClub: { select: { id: true, name: true } },
  pickupClub: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      storeSettings: { select: { pickupHours: true } },
    },
  },
  items: {
    select: {
      id: true,
      name: true,
      size: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
    },
  },
} satisfies Prisma.StoreOrderSelect;

type OrderRow = Prisma.StoreOrderGetPayload<{ select: typeof ORDER_SELECT }>;

export function presentOrder(
  order: OrderRow,
  options: { withPickupCode?: string } = {},
) {
  const platformAmount = Number(order.platformAmount);
  const clubAmount = Number(order.clubAmount);
  return {
    ...order,
    subtotal: Number(order.subtotal),
    platformPercent: Number(order.platformPercent),
    clubPercent: Number(order.clubPercent),
    platformAmount,
    clubAmount,
    fluxionAmount: Math.round((platformAmount - clubAmount) * 100) / 100,
    sellerAmount: Number(order.sellerAmount),
    seller:
      order.sellerType === 'MERCHANT'
        ? {
            type: 'MERCHANT' as const,
            id: order.merchant!.id,
            name: order.merchant!.tradeName,
          }
        : {
            type: 'CLUB' as const,
            id: order.sellerClub!.id,
            name: order.sellerClub!.name,
          },
    items: order.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    ...(options.withPickupCode ? { pickupCode: options.withPickupCode } : {}),
  };
}

/** Transiciones válidas de un pedido. */
const FLOW: Record<string, { from: StoreOrderStatus[]; to: StoreOrderStatus }> =
  {
    confirm: { from: ['PLACED'], to: 'CONFIRMED' },
    receive: { from: ['CONFIRMED'], to: 'AT_CLUB' },
    deliver: { from: ['AT_CLUB', 'CONFIRMED'], to: 'DELIVERED' },
    cancel: { from: ['PLACED', 'CONFIRMED', 'AT_CLUB'], to: 'CANCELLED' },
  };

/** Pedidos de la tienda: alta con snapshot de comisiones, stock y retiro en el club. */
@Injectable()
export class StoreOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissions: CommissionsService,
  ) {}

  async create(firebaseUid: string, dto: CreateStoreOrderDto) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!user) throw new UnauthorizedException('Perfil no registrado');
    if (!user.phone)
      throw new BadRequestException(
        'Completá tu teléfono en el perfil para poder comprar.',
      );

    const merchantItems = dto.items.filter((item) => item.productId);
    const clubItems = dto.items.filter((item) => item.clubProductId);
    if (merchantItems.length + clubItems.length !== dto.items.length)
      throw new BadRequestException('Cada producto tiene que indicar su id.');
    if (merchantItems.length && clubItems.length)
      throw new BadRequestException('Un pedido es de un solo vendedor.');

    const club = await this.prisma.club.findFirst({
      where: { id: dto.pickupClubId, isPublic: true, ...CLUB_IN_GOOD_STANDING },
      select: {
        id: true,
        name: true,
        companyId: true,
        timezone: true,
        publicShop: true,
        storeSettings: true,
      },
    });
    if (!club) throw new NotFoundException('Club de retiro no disponible');

    const order = await this.prisma.$transaction(async (tx) => {
      const lines: Array<{
        productId?: string;
        clubProductId?: string;
        name: string;
        size: string | null;
        unitPrice: number;
        quantity: number;
      }> = [];
      let merchantId: string | null = null;

      if (merchantItems.length) {
        const settings = club.storeSettings;
        if (!settings?.acceptMerchants || settings.paused)
          throw new BadRequestException(
            `${club.name} no recibe pedidos de comercios por ahora.`,
          );
        const ids = [...new Set(merchantItems.map((item) => item.productId!))];
        const products = await tx.storeProduct.findMany({
          where: { id: { in: ids }, active: true },
          include: {
            merchant: { select: { id: true, status: true, tradeName: true } },
          },
        });
        if (products.length !== ids.length)
          throw new BadRequestException(
            'Algún producto ya no está disponible.',
          );
        const merchants = new Set(
          products.map((product) => product.merchantId),
        );
        if (merchants.size !== 1)
          throw new BadRequestException('Un pedido es de un solo comercio.');
        merchantId = products[0].merchantId;
        if (products[0].merchant.status !== 'ACTIVO')
          throw new BadRequestException(
            'El comercio no está vendiendo por ahora.',
          );
        const excluded = products.find((product) =>
          settings.excludedCategories.includes(product.category),
        );
        if (excluded)
          throw new BadRequestException(
            `${club.name} no recibe productos de ese rubro (${excluded.name}).`,
          );

        if (settings.dailyCapacity) {
          const today = await tx.storeOrder.count({
            where: {
              pickupClubId: club.id,
              sellerType: 'MERCHANT',
              status: { not: 'CANCELLED' },
              createdAt: { gte: startOfToday(club.timezone) },
            },
          });
          if (today >= settings.dailyCapacity)
            throw new ConflictException(
              `${club.name} completó los retiros de hoy. Probá mañana u otro club.`,
            );
        }

        for (const item of merchantItems) {
          const product = products.find(
            (candidate) => candidate.id === item.productId,
          )!;
          // Descuento atómico: si no alcanza, el pedido no se crea.
          const { count } = await tx.storeProduct.updateMany({
            where: {
              id: product.id,
              active: true,
              stock: { gte: item.quantity },
            },
            data: { stock: { decrement: item.quantity } },
          });
          if (count === 0)
            throw new ConflictException(
              `Sin stock suficiente de ${product.name}.`,
            );
          lines.push({
            productId: product.id,
            name: product.name,
            size: null,
            unitPrice: Number(product.price),
            quantity: item.quantity,
          });
        }
      } else {
        if (!club.publicShop)
          throw new BadRequestException(`${club.name} no vende en la app.`);
        for (const item of clubItems) {
          // Bloquea la fila del producto mientras se descuenta el talle.
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              name: string;
              price: Prisma.Decimal;
              sizes: Prisma.JsonValue;
              status: string;
              clubId: string;
            }>
          >`SELECT "id", "name", "price", "sizes", "status", "clubId" FROM "ShopProduct" WHERE "id" = ${item.clubProductId} FOR UPDATE`;
          const product = rows[0];
          if (
            !product ||
            product.status !== 'active' ||
            product.clubId !== club.id
          )
            throw new BadRequestException(
              'Algún producto ya no está disponible.',
            );
          const sizes = clubSizes(product.sizes);
          let size: string | null = null;
          if (sizes.length) {
            const index = sizes.findIndex(
              (candidate) => candidate.label === item.size,
            );
            if (index < 0)
              throw new BadRequestException(
                `Elegí un talle para ${product.name}.`,
              );
            const stock = sizes[index].stock;
            if (stock !== undefined) {
              if (stock < item.quantity)
                throw new ConflictException(
                  `Sin stock suficiente de ${product.name} (${sizes[index].label}).`,
                );
              const next = (product.sizes as Prisma.JsonArray).map(
                (raw, position) =>
                  position === index
                    ? {
                        ...(raw as Prisma.JsonObject),
                        stock: stock - item.quantity,
                      }
                    : raw,
              );
              await tx.shopProduct.update({
                where: { id: product.id },
                data: { sizes: next },
              });
            }
            size = sizes[index].label;
          }
          lines.push({
            clubProductId: product.id,
            name: product.name,
            size,
            unitPrice: Number(product.price),
            quantity: item.quantity,
          });
        }
      }

      const subtotal = lines.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0,
      );
      const rates = await this.commissions.resolve(
        { merchantId, clubId: club.id },
        tx,
      );
      const amounts = split(subtotal, rates.platformPercent, rates.clubPercent);

      return tx.storeOrder.create({
        data: {
          code: orderCode(),
          buyerUserId: user.id,
          sellerType: merchantId ? 'MERCHANT' : 'CLUB',
          merchantId,
          sellerClubId: merchantId ? null : club.id,
          pickupClubId: club.id,
          pickupCompanyId: club.companyId,
          // Venta propia del club: el club la confirma y entrega, sin paso de recepción.
          pickupCode: pickupCode(),
          buyerName: user.name || user.email,
          buyerPhone: user.phone,
          notes: dto.notes?.trim() || null,
          subtotal: amounts.subtotal,
          platformPercent: rates.platformPercent,
          clubPercent: rates.clubPercent,
          platformAmount: amounts.platformAmount,
          clubAmount: amounts.clubAmount,
          sellerAmount: amounts.sellerAmount,
          commissionRules: rates.rules,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              clubProductId: line.clubProductId,
              name: line.name,
              size: line.size,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              lineTotal: Math.round(line.unitPrice * line.quantity * 100) / 100,
            })),
          },
        },
        select: { ...ORDER_SELECT, pickupCode: true },
      });
    });

    const { pickupCode: code, ...rest } = order;
    return presentOrder(rest, { withPickupCode: code });
  }

  async listForBuyer(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true },
    });
    if (!user) return [];
    const orders = await this.prisma.storeOrder.findMany({
      where: { buyerUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { ...ORDER_SELECT, pickupCode: true },
    });
    // El comprador ve su código solo mientras el pedido está en curso.
    return orders.map(({ pickupCode: code, ...order }) =>
      presentOrder(order, {
        withPickupCode: ['CONFIRMED', 'AT_CLUB', 'PLACED'].includes(
          order.status,
        )
          ? code
          : undefined,
      }),
    );
  }

  async cancelByBuyer(firebaseUid: string, id: string) {
    const order = await this.prisma.storeOrder.findFirst({
      where: { id, buyer: { firebaseUid } },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status !== 'PLACED')
      throw new BadRequestException(
        'El vendedor ya confirmó el pedido: pedile la cancelación.',
      );
    return this.transition(id, 'cancel', {
      reason: 'Cancelado por el comprador',
    });
  }

  listForMerchant(merchantId: string, status?: StoreOrderStatus) {
    return this.prisma.storeOrder
      .findMany({
        where: { merchantId, ...(status && { status }) },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: ORDER_SELECT,
      })
      .then((orders) => orders.map((order) => presentOrder(order)));
  }

  /** Pedidos que pasan por el club: los que retira (de comercios) y sus ventas propias. */
  async listForClub(clubId: string, scope: 'active' | 'history') {
    const statuses: StoreOrderStatus[] =
      scope === 'active'
        ? ['PLACED', 'CONFIRMED', 'AT_CLUB']
        : ['DELIVERED', 'CANCELLED'];
    const orders = await this.prisma.storeOrder.findMany({
      where: {
        pickupClubId: clubId,
        status: { in: statuses },
        // Los pedidos de comercios aparecen recién cuando el comercio los confirma.
        NOT: { sellerType: 'MERCHANT', status: 'PLACED' },
      },
      orderBy: { createdAt: scope === 'active' ? 'asc' : 'desc' },
      take: 200,
      select: ORDER_SELECT,
    });
    return orders.map((order) => presentOrder(order));
  }

  async requireOrder(where: Prisma.StoreOrderWhereInput) {
    const order = await this.prisma.storeOrder.findFirst({
      where,
      select: { id: true, status: true, sellerType: true, pickupCode: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  /** Entrega en el club: exige el código que muestra el comprador. */
  async deliver(clubId: string, id: string, code: string) {
    const order = await this.requireOrder({ id, pickupClubId: clubId });
    if (order.sellerType === 'MERCHANT' && order.status !== 'AT_CLUB')
      throw new BadRequestException(
        'Primero registrá que el comercio dejó el pedido en el club.',
      );
    if (order.pickupCode !== code)
      throw new ForbiddenException('El código no coincide con el del pedido.');
    return this.transition(id, 'deliver');
  }

  /**
   * Cambio de estado seguro ante dobles clics: solo se aplica si el pedido
   * sigue en un estado de origen válido. Cancelar devuelve el stock y anula la comisión;
   * entregar devenga la comisión.
   */
  async transition(
    id: string,
    action: keyof typeof FLOW,
    options: { reason?: string } = {},
  ) {
    const step = FLOW[action];
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.storeOrder.updateMany({
        where: { id, status: { in: step.from } },
        data: {
          status: step.to,
          ...(action === 'confirm' && { confirmedAt: now }),
          ...(action === 'receive' && { receivedAtClubAt: now }),
          ...(action === 'deliver' && {
            deliveredAt: now,
            commissionStatus: 'ACCRUED',
            commissionAccruedAt: now,
          }),
          ...(action === 'cancel' && {
            cancelledAt: now,
            cancelReason: options.reason?.trim() || null,
            commissionStatus: 'VOID',
          }),
        },
      });
      if (count === 0)
        throw new ConflictException(
          'El pedido cambió de estado. Actualizá la pantalla.',
        );

      if (action === 'cancel') {
        const items = await tx.storeOrderItem.findMany({
          where: { orderId: id },
          select: {
            productId: true,
            clubProductId: true,
            size: true,
            quantity: true,
          },
        });
        for (const item of items) {
          if (item.productId)
            await tx.storeProduct.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          if (item.clubProductId && item.size) {
            const rows = await tx.$queryRaw<
              Array<{ sizes: Prisma.JsonValue }>
            >`SELECT "sizes" FROM "ShopProduct" WHERE "id" = ${item.clubProductId} FOR UPDATE`;
            if (!rows[0] || !Array.isArray(rows[0].sizes)) continue;
            const next = rows[0].sizes.map((raw) => {
              const size = raw as Prisma.JsonObject;
              return size?.label === item.size && typeof size.stock === 'number'
                ? { ...size, stock: size.stock + item.quantity }
                : raw;
            });
            await tx.shopProduct.update({
              where: { id: item.clubProductId },
              data: { sizes: next },
            });
          }
        }
      }
      return tx.storeOrder.findUniqueOrThrow({
        where: { id },
        select: ORDER_SELECT,
      });
    });
    return presentOrder(updated);
  }
}
