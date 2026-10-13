import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { ClubStoreSettingsDto } from './dto/store.dto';
import { StoreOrdersService } from './store-orders.service';

/** El club en la tienda: punto de retiro, ventas propias y lo que gana por retiros. */
@Injectable()
export class ClubStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: StoreOrdersService,
  ) {}

  async settings(companyId: string, clubId: string) {
    const club = await this.requireClub(companyId, clubId);
    const settings = await this.prisma.clubStoreSettings.findUnique({
      where: { clubId },
    });
    const earnings = await this.prisma.storeOrder.aggregate({
      where: {
        pickupClubId: clubId,
        sellerType: 'MERCHANT',
        commissionStatus: 'ACCRUED',
      },
      _sum: { clubAmount: true },
      _count: true,
    });
    return {
      acceptMerchants: settings?.acceptMerchants ?? false,
      paused: settings?.paused ?? false,
      excludedCategories: settings?.excludedCategories ?? [],
      pickupHours: settings?.pickupHours ?? null,
      dailyCapacity: settings?.dailyCapacity ?? null,
      publicShop: club.publicShop,
      isPublic: club.isPublic,
      earnings: {
        orders: earnings._count,
        amount: Number(earnings._sum.clubAmount ?? 0),
      },
    };
  }

  async update(companyId: string, clubId: string, dto: ClubStoreSettingsDto) {
    await this.requireClub(companyId, clubId);
    const data = {
      acceptMerchants: dto.acceptMerchants,
      paused: dto.paused,
      excludedCategories: [...new Set(dto.excludedCategories)],
      pickupHours: dto.pickupHours?.trim() || null,
      dailyCapacity: dto.dailyCapacity ?? null,
    };
    await this.prisma.clubStoreSettings.upsert({
      where: { clubId },
      create: { clubId, companyId, ...data },
      update: data,
    });
    return this.settings(companyId, clubId);
  }

  async list(companyId: string, clubId: string, scope: 'active' | 'history') {
    await this.requireClub(companyId, clubId);
    return this.orders.listForClub(clubId, scope);
  }

  /** Venta propia del club: el club la confirma (tiene la mercadería). */
  async confirm(companyId: string, clubId: string, id: string) {
    await this.requireClub(companyId, clubId);
    const order = await this.orders.requireOrder({ id, sellerClubId: clubId });
    if (order.sellerType !== 'CLUB')
      throw new BadRequestException('Lo confirma el comercio.');
    return this.orders.transition(id, 'confirm');
  }

  /** El comercio dejó el pedido en el club. */
  async receive(companyId: string, clubId: string, id: string) {
    await this.requireClub(companyId, clubId);
    const order = await this.orders.requireOrder({ id, pickupClubId: clubId });
    if (order.sellerType !== 'MERCHANT')
      throw new BadRequestException(
        'Las ventas del club no pasan por recepción.',
      );
    return this.orders.transition(id, 'receive');
  }

  async deliver(companyId: string, clubId: string, id: string, code: string) {
    await this.requireClub(companyId, clubId);
    return this.orders.deliver(clubId, id, code);
  }

  async cancel(companyId: string, clubId: string, id: string, reason?: string) {
    await this.requireClub(companyId, clubId);
    await this.orders.requireOrder({ id, sellerClubId: clubId });
    return this.orders.transition(id, 'cancel', {
      reason: reason || 'Cancelado por el club',
    });
  }

  private async requireClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true, publicShop: true, isPublic: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    return club;
  }
}
