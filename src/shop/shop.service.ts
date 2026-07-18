import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ShopOrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateShopOrderDto } from './dto/create-shop-order.dto';
import { CreateShopProductDto } from './dto/create-shop-product.dto';
import { UpdateShopOrderDto } from './dto/update-shop-order.dto';
import { UpdateShopProductDto } from './dto/update-shop-product.dto';

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts(companyId: string, filters?: { clubId?: string }) {
    return this.prisma.shopProduct.findMany({
      where: {
        companyId,
        ...(filters?.clubId ? { clubId: filters.clubId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createProduct(companyId: string, dto: CreateShopProductDto) {
    return this.prisma.shopProduct.create({
      data: {
        companyId,
        clubId: dto.clubId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        category: dto.category,
        images: dto.images as Prisma.InputJsonValue | undefined,
        sizes: dto.sizes as Prisma.InputJsonValue | undefined,
        sports: dto.sports as Prisma.InputJsonValue | undefined,
        status: dto.status ?? 'active',
      },
    });
  }

  async updateProduct(companyId: string, id: string, dto: UpdateShopProductDto) {
    await this.getProduct(companyId, id);

    return this.prisma.shopProduct.update({
      where: { id },
      data: {
        clubId: dto.clubId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        category: dto.category,
        images: dto.images as Prisma.InputJsonValue | undefined,
        sizes: dto.sizes as Prisma.InputJsonValue | undefined,
        sports: dto.sports as Prisma.InputJsonValue | undefined,
        status: dto.status,
      },
    });
  }

  async removeProduct(companyId: string, id: string) {
    await this.getProduct(companyId, id);
    await this.prisma.shopProduct.delete({ where: { id } });
    return { ok: true };
  }

  listOrders(companyId: string, filters?: { clubId?: string; customerExternalId?: string }) {
    return this.prisma.shopOrder.findMany({
      where: {
        companyId,
        ...(filters?.clubId ? { clubId: filters.clubId } : {}),
        ...(filters?.customerExternalId ? { customerExternalId: filters.customerExternalId } : {}),
      },
      include: { product: true, club: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrder(companyId: string, dto: CreateShopOrderDto) {
    return this.prisma.shopOrder.create({
      data: {
        companyId,
        clubId: dto.clubId,
        customerExternalId: dto.customerExternalId,
        customerName: dto.customerName,
        productId: dto.productId,
        productName: dto.productName,
        productImage: dto.productImage,
        size: dto.size,
        price: dto.price,
      },
      include: { product: true, club: true },
    });
  }

  async updateOrder(companyId: string, id: string, dto: UpdateShopOrderDto) {
    await this.getOrder(companyId, id);

    return this.prisma.shopOrder.update({
      where: { id },
      data: { status: dto.status as ShopOrderStatus },
      include: { product: true, club: true },
    });
  }

  private async getProduct(companyId: string, id: string) {
    const product = await this.prisma.shopProduct.findFirst({ where: { companyId, id } });
    if (!product) throw new NotFoundException('Shop product not found');
    return product;
  }

  private async getOrder(companyId: string, id: string) {
    const order = await this.prisma.shopOrder.findFirst({ where: { companyId, id } });
    if (!order) throw new NotFoundException('Shop order not found');
    return order;
  }
}