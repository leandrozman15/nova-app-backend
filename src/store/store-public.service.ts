import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CLUB_IN_GOOD_STANDING } from '../subscriptions/club-access';
import type { ListStoreDto } from './dto/store.dto';
import { STORE_CATEGORIES } from './store-categories';
import { firstImage } from './store-orders.service';

/**
 * Las fotos comprimidas (data URL) se sirven aparte para no inflar el listado;
 * las https se usan tal cual.
 */
export function publicImage(
  kind: 'p' | 'c',
  id: string,
  raw: string | null,
  updatedAt: Date,
) {
  if (!raw) return null;
  if (!raw.startsWith('data:')) return raw;
  return `/api/public/store/images/${kind}/${id}?v=${updatedAt.getTime()}`;
}

/** Decodifica una data URL de imagen. */
export function decodeImage(raw: string | null) {
  const match = raw?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return null;
  return { contentType: match[1], body: Buffer.from(match[2], 'base64') };
}

const PUBLIC_CLUB: Prisma.ClubWhereInput = {
  isPublic: true,
  ...CLUB_IN_GOOD_STANDING,
};

/** Mapea los rubros libres de la tienda del club al catálogo de la app. */
function clubCategory(raw: string) {
  const value = raw.trim().toLowerCase();
  if (/(calzado|botin|zapat)/.test(value)) return 'calzado';
  if (/(remera|camiseta|short|buzo|campera|indument|ropa|media)/.test(value))
    return 'indumentaria';
  if (/(pelota|equip|raqueta|palo|guante|protec)/.test(value))
    return 'equipamiento';
  if (/(bebida|agua|isot)/.test(value)) return 'bebidas';
  if (/(suplement|nutri|prote)/.test(value)) return 'nutricion';
  if (/(accesor|bolso|gorra|botella)/.test(value)) return 'accesorios';
  return STORE_CATEGORIES.some((item) => item.id === value) ? value : 'otros';
}

/** Tienda de la app: productos de comercios activos y de clubes que venden online. */
@Injectable()
export class StorePublicService {
  constructor(private readonly prisma: PrismaService) {}

  /** Clubes donde se puede retirar un pedido de comercio. */
  async pickupClubs(category?: string) {
    const clubs = await this.prisma.club.findMany({
      where: {
        ...PUBLIC_CLUB,
        storeSettings: {
          is: {
            acceptMerchants: true,
            paused: false,
            ...(category && { NOT: { excludedCategories: { has: category } } }),
          },
        },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        logoUrl: true,
        storeSettings: {
          select: { pickupHours: true, excludedCategories: true },
        },
      },
    });
    return clubs.map(({ storeSettings, ...club }) => ({
      ...club,
      pickupHours: storeSettings?.pickupHours ?? null,
      excludedCategories: storeSettings?.excludedCategories ?? [],
    }));
  }

  async list(query: ListStoreDto) {
    const q = query.q?.trim();
    const pickupCount = await this.prisma.clubStoreSettings.count({
      where: { acceptMerchants: true, paused: false, club: PUBLIC_CLUB },
    });

    const merchantProducts =
      pickupCount === 0 || query.clubId
        ? []
        : await this.prisma.storeProduct.findMany({
            where: {
              active: true,
              stock: { gt: 0 },
              merchant: { status: 'ACTIVO' },
              ...(query.category && { category: query.category }),
              ...(q && {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                  {
                    merchant: {
                      tradeName: { contains: q, mode: 'insensitive' },
                    },
                  },
                ],
              }),
            },
            orderBy: { createdAt: 'desc' },
            take: 120,
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              price: true,
              stock: true,
              imageUrl: true,
              updatedAt: true,
              merchant: {
                select: {
                  id: true,
                  tradeName: true,
                  logoUrl: true,
                  city: true,
                },
              },
            },
          });

    const clubProducts = await this.prisma.shopProduct.findMany({
      where: {
        status: 'active',
        club: { ...PUBLIC_CLUB, publicShop: true },
        ...(query.clubId && { clubId: query.clubId }),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { club: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        price: true,
        images: true,
        sizes: true,
        updatedAt: true,
        club: { select: { id: true, name: true, logoUrl: true, city: true } },
      },
    });

    const items = [
      ...merchantProducts.map((product) => ({
        id: product.id,
        kind: 'MERCHANT' as const,
        name: product.name,
        description: product.description,
        category: product.category,
        price: Number(product.price),
        imageUrl: publicImage(
          'p',
          product.id,
          product.imageUrl,
          product.updatedAt,
        ),
        stock: product.stock,
        sizes: [] as Array<{ label: string; available: boolean }>,
        seller: {
          type: 'MERCHANT' as const,
          id: product.merchant.id,
          name: product.merchant.tradeName,
          logoUrl: product.merchant.logoUrl,
          city: product.merchant.city,
        },
      })),
      ...clubProducts
        .map((product) => {
          const sizes = Array.isArray(product.sizes)
            ? (product.sizes as Array<{ label?: unknown; stock?: unknown }>)
                .filter((size) => typeof size?.label === 'string')
                .map((size) => ({
                  label: size.label as string,
                  available: typeof size.stock !== 'number' || size.stock > 0,
                }))
            : [];
          return {
            id: product.id,
            kind: 'CLUB' as const,
            name: product.name,
            description: product.description,
            category: clubCategory(product.category),
            price: Number(product.price),
            imageUrl: publicImage(
              'c',
              product.id,
              firstImage(product.images),
              product.updatedAt,
            ),
            stock: null as number | null,
            sizes,
            seller: {
              type: 'CLUB' as const,
              id: product.club.id,
              name: product.club.name,
              logoUrl: product.club.logoUrl,
              city: product.club.city,
            },
          };
        })
        .filter(
          (product) =>
            (!query.category || product.category === query.category) &&
            (product.sizes.length === 0 ||
              product.sizes.some((size) => size.available)),
        ),
    ];
    return { items, pickupAvailable: pickupCount > 0 };
  }

  /** Foto de un producto (p = comercio, c = club) para usar en <img>. */
  async image(kind: string, id: string) {
    let raw: string | null = null;
    if (kind === 'p') {
      const product = await this.prisma.storeProduct.findUnique({
        where: { id },
        select: { imageUrl: true },
      });
      raw = product?.imageUrl ?? null;
    } else if (kind === 'c') {
      const product = await this.prisma.shopProduct.findFirst({
        where: {
          id,
          status: 'active',
          club: { ...PUBLIC_CLUB, publicShop: true },
        },
        select: { images: true },
      });
      raw = product ? firstImage(product.images) : null;
    }
    if (raw && !raw.startsWith('data:')) return { redirect: raw };
    const image = decodeImage(raw);
    if (!image) throw new NotFoundException('Imagen no encontrada');
    return image;
  }

  async merchant(id: string) {
    const merchant = await this.prisma.merchant.findFirst({
      where: { id, status: 'ACTIVO' },
      select: {
        id: true,
        tradeName: true,
        description: true,
        logoUrl: true,
        city: true,
        categories: true,
      },
    });
    if (!merchant) throw new NotFoundException('Comercio no disponible');
    return merchant;
  }
}
