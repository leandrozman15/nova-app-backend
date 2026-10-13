import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { MerchantRole, StoreOrderStatus } from '@prisma/client';

import { AuditService, type AuditActor } from '../platform/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ProductDto,
  SetPaymentAccountDto,
  UpdateMerchantProfileDto,
  UpdateProductDto,
} from './dto/store.dto';
import {
  activationChecklist,
  hashToken,
  MerchantsService,
} from './merchants.service';
import { StoreOrdersService } from './store-orders.service';

function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

const presentProduct = <T extends { price: unknown }>(product: T) => ({
  ...product,
  price: Number(product.price),
});

/** Portal del comercio: invitación, datos no fiscales, cuenta de cobro, productos y pedidos. */
@Injectable()
export class MerchantPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly merchants: MerchantsService,
    private readonly orders: StoreOrdersService,
  ) {}

  /** Lo que se puede saber de una invitación antes de iniciar sesión. */
  async invitationInfo(token: string) {
    const invitation = await this.prisma.merchantInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        merchant: { select: { tradeName: true, status: true } },
      },
    });
    if (!invitation) throw new NotFoundException('La invitación no existe.');
    return {
      merchantName: invitation.merchant.tradeName,
      email: maskEmail(invitation.email),
      role: invitation.role,
      state: invitation.acceptedAt
        ? 'ACEPTADA'
        : invitation.revokedAt
          ? 'REVOCADA'
          : invitation.expiresAt.getTime() < Date.now()
            ? 'VENCIDA'
            : invitation.merchant.status === 'SUSPENDIDO'
              ? 'SUSPENDIDO'
              : 'PENDIENTE',
    };
  }

  /** Acepta la invitación con la cuenta iniciada: el email tiene que coincidir. */
  async accept(actor: AuditActor, token: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: actor.uid },
      select: { id: true, email: true },
    });
    if (!user) throw new UnauthorizedException('Perfil no registrado');

    const invitation = await this.prisma.merchantInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { merchant: { select: { id: true, status: true } } },
    });
    if (!invitation || invitation.revokedAt)
      throw new NotFoundException(
        'La invitación no existe o fue reemplazada por otra.',
      );
    if (invitation.acceptedAt)
      throw new BadRequestException('La invitación ya se usó.');
    if (invitation.expiresAt.getTime() < Date.now())
      throw new BadRequestException(
        'La invitación venció. Pedile a Fluxion una nueva.',
      );
    if (invitation.merchant.status === 'SUSPENDIDO')
      throw new ForbiddenException('El comercio está suspendido.');
    const email = (actor.email ?? user.email).trim().toLowerCase();
    if (email !== invitation.email)
      throw new ForbiddenException(
        `La invitación es para ${maskEmail(invitation.email)}. Iniciá sesión con ese email.`,
      );

    await this.prisma.$transaction(async (tx) => {
      // Uso único: solo la primera aceptación cambia la fila.
      const { count } = await tx.merchantInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date(), acceptedByUserId: user.id },
      });
      if (count === 0)
        throw new BadRequestException('La invitación ya se usó.');
      await tx.merchantMember.upsert({
        where: {
          merchantId_userId: {
            merchantId: invitation.merchantId,
            userId: user.id,
          },
        },
        create: {
          merchantId: invitation.merchantId,
          userId: user.id,
          role: invitation.role,
        },
        update: { role: invitation.role, active: true },
      });
    });
    await this.audit.record(
      actor,
      'merchant.invitation.accept',
      { type: 'Merchant', id: invitation.merchantId },
      { after: { invitationId: invitation.id, role: invitation.role } },
    );
    await this.merchants.maybeActivate(actor, invitation.merchantId);
    return { merchantId: invitation.merchantId };
  }

  /** Comercios a los que pertenece el usuario. */
  async mine(firebaseUid: string) {
    const memberships = await this.prisma.merchantMember.findMany({
      where: { active: true, user: { firebaseUid } },
      select: {
        role: true,
        merchant: {
          select: { id: true, tradeName: true, status: true, logoUrl: true },
        },
      },
    });
    return memberships.map((membership) => ({
      ...membership.merchant,
      role: membership.role,
    }));
  }

  async get(firebaseUid: string, merchantId: string) {
    const { role } = await this.member(firebaseUid, merchantId);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: {
        members: { select: { role: true, active: true } },
        paymentAccount: {
          select: {
            provider: true,
            status: true,
            holderName: true,
            accountLabel: true,
            connectedAt: true,
          },
        },
      },
    });
    // Lo interno de Fluxion (quién verificó, notas) no se muestra al comercio.
    return {
      id: merchant.id,
      legalName: merchant.legalName,
      tradeName: merchant.tradeName,
      cuit: merchant.cuit,
      ivaCondition: merchant.ivaCondition,
      contactName: merchant.contactName,
      contactEmail: merchant.contactEmail,
      contactPhone: merchant.contactPhone,
      address: merchant.address,
      city: merchant.city,
      description: merchant.description,
      logoUrl: merchant.logoUrl,
      categories: merchant.categories,
      status: merchant.status,
      suspendedReason: merchant.suspendedReason,
      paymentAccount: merchant.paymentAccount,
      role,
      checklist: activationChecklist(merchant),
    };
  }

  async updateProfile(
    actor: AuditActor,
    merchantId: string,
    dto: UpdateMerchantProfileDto,
  ) {
    await this.member(actor.uid, merchantId, ['ADMIN_COMERCIO']);
    const clean = (value: string | undefined) =>
      value === undefined ? undefined : value.trim() || null;
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        contactName: clean(dto.contactName),
        contactPhone: clean(dto.contactPhone),
        address: clean(dto.address),
        city: clean(dto.city),
        description: clean(dto.description),
        logoUrl: clean(dto.logoUrl),
      },
    });
    return this.get(actor.uid, merchantId);
  }

  /**
   * Cuenta de cobro. Mientras no haya cobro online, "conectada" = datos de
   * cobro cargados por el responsable. Queda auditado.
   */
  async setPaymentAccount(
    actor: AuditActor,
    merchantId: string,
    dto: SetPaymentAccountDto,
  ) {
    await this.member(actor.uid, merchantId, ['ADMIN_COMERCIO']);
    const before = await this.prisma.merchantPaymentAccount.findUnique({
      where: { merchantId },
      select: {
        provider: true,
        status: true,
        holderName: true,
        accountLabel: true,
      },
    });
    const data = {
      provider: dto.provider,
      holderName: dto.holderName.trim(),
      accountLabel: dto.accountLabel.trim(),
      status: 'CONNECTED',
      connectedAt: new Date(),
    };
    await this.prisma.merchantPaymentAccount.upsert({
      where: { merchantId },
      create: { merchantId, ...data },
      update: data,
    });
    await this.audit.record(
      actor,
      'merchant.payment_account.update',
      { type: 'Merchant', id: merchantId },
      {
        before,
        after: {
          provider: data.provider,
          status: data.status,
          holderName: data.holderName,
          accountLabel: data.accountLabel,
        },
      },
    );
    await this.merchants.maybeActivate(actor, merchantId);
    return this.get(actor.uid, merchantId);
  }

  async products(firebaseUid: string, merchantId: string) {
    await this.member(firebaseUid, merchantId);
    const products = await this.prisma.storeProduct.findMany({
      where: { merchantId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return products.map(presentProduct);
  }

  async createProduct(
    firebaseUid: string,
    merchantId: string,
    dto: ProductDto,
  ) {
    await this.writable(firebaseUid, merchantId);
    const product = await this.prisma.storeProduct.create({
      data: {
        merchantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        category: dto.category,
        price: dto.price,
        stock: dto.stock,
        imageUrl: dto.imageUrl || null,
        active: dto.active ?? true,
      },
    });
    return presentProduct(product);
  }

  async updateProduct(
    firebaseUid: string,
    merchantId: string,
    id: string,
    dto: UpdateProductDto,
  ) {
    await this.writable(firebaseUid, merchantId);
    const existing = await this.prisma.storeProduct.findFirst({
      where: { id, merchantId },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado');
    const product = await this.prisma.storeProduct.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description.trim() || null,
        category: dto.category,
        price: dto.price,
        stock: dto.stock,
        imageUrl: dto.imageUrl === undefined ? undefined : dto.imageUrl || null,
        active: dto.active,
      },
    });
    return presentProduct(product);
  }

  async listOrders(
    firebaseUid: string,
    merchantId: string,
    status?: StoreOrderStatus,
  ) {
    await this.member(firebaseUid, merchantId);
    return this.orders.listForMerchant(merchantId, status);
  }

  async confirmOrder(firebaseUid: string, merchantId: string, id: string) {
    await this.member(firebaseUid, merchantId);
    await this.orders.requireOrder({ id, merchantId });
    return this.orders.transition(id, 'confirm');
  }

  async cancelOrder(
    firebaseUid: string,
    merchantId: string,
    id: string,
    reason?: string,
  ) {
    await this.member(firebaseUid, merchantId);
    await this.orders.requireOrder({ id, merchantId });
    return this.orders.transition(id, 'cancel', {
      reason: reason || 'Cancelado por el comercio',
    });
  }

  private async member(
    firebaseUid: string,
    merchantId: string,
    roles?: MerchantRole[],
  ) {
    const membership = await this.prisma.merchantMember.findFirst({
      where: { merchantId, active: true, user: { firebaseUid } },
      select: { role: true, merchant: { select: { status: true } } },
    });
    if (!membership)
      throw new ForbiddenException('No sos parte de este comercio.');
    if (roles && !roles.includes(membership.role))
      throw new ForbiddenException(
        'Solo el responsable del comercio puede hacer esto.',
      );
    return { role: membership.role, status: membership.merchant.status };
  }

  private async writable(firebaseUid: string, merchantId: string) {
    const membership = await this.member(firebaseUid, merchantId);
    if (membership.status === 'SUSPENDIDO')
      throw new ForbiddenException(
        'El comercio está suspendido: no puede cargar productos.',
      );
    return membership;
  }
}
