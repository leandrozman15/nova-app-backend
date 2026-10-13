import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Merchant } from '@prisma/client';

import { AuditService, type AuditActor } from '../platform/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionsService } from './commissions.service';
import type {
  CreateMerchantDto,
  InviteMerchantDto,
  UpdateMerchantFiscalDto,
} from './dto/store.dto';
import { isValidCuit, normalizeCuit } from './store-categories';

export const INVITATION_DAYS = 7;

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const FISCAL_FIELDS = [
  'legalName',
  'tradeName',
  'cuit',
  'ivaCondition',
  'contactEmail',
  'categories',
] as const;

const fiscal = (merchant: Merchant) =>
  Object.fromEntries(FISCAL_FIELDS.map((field) => [field, merchant[field]]));

/** Qué le falta a un comercio para quedar ACTIVO. */
export function activationChecklist(merchant: {
  cuitVerifiedAt: Date | null;
  members: Array<{ role: string; active: boolean }>;
  paymentAccount: { status: string } | null;
}) {
  return {
    cuitVerified: Boolean(merchant.cuitVerifiedAt),
    ownerAccepted: merchant.members.some(
      (member) => member.active && member.role === 'ADMIN_COMERCIO',
    ),
    paymentAccount: merchant.paymentAccount?.status === 'CONNECTED',
  };
}

const MERCHANT_DETAIL = {
  members: {
    select: {
      id: true,
      role: true,
      active: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  },
  invitations: {
    orderBy: { createdAt: 'desc' as const },
    take: 10,
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  },
  paymentAccount: {
    select: {
      provider: true,
      status: true,
      holderName: true,
      accountLabel: true,
      connectedAt: true,
    },
  },
} satisfies Prisma.MerchantInclude;

/** Alta y gestión de comercios desde el panel de Fluxion (todo queda auditado). */
@Injectable()
export class MerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly commissions: CommissionsService,
  ) {}

  async list(status?: string) {
    const merchants = await this.prisma.merchant.findMany({
      where: status ? { status: status as Merchant['status'] } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        ...MERCHANT_DETAIL,
        _count: {
          select: { products: { where: { active: true } }, orders: true },
        },
      },
    });
    const rules = await this.commissions.currentRules();
    return merchants.map((merchant) => this.present(merchant, rules));
  }

  async get(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        ...MERCHANT_DETAIL,
        _count: {
          select: { products: { where: { active: true } }, orders: true },
        },
      },
    });
    if (!merchant) throw new NotFoundException('Comercio no encontrado');
    return this.present(merchant, await this.commissions.currentRules());
  }

  /** Crea el comercio (INVITADO) y la primera invitación para el responsable. */
  async create(actor: AuditActor, dto: CreateMerchantDto) {
    const cuit = normalizeCuit(dto.cuit);
    if (!isValidCuit(cuit))
      throw new BadRequestException(
        'El CUIT no es válido (revisá el dígito verificador).',
      );
    const existing = await this.prisma.merchant.findUnique({
      where: { cuit },
      select: { tradeName: true },
    });
    if (existing)
      throw new ConflictException(
        `Ya existe un comercio con ese CUIT (${existing.tradeName}).`,
      );

    if (dto.platformPercent !== undefined)
      await this.commissions.checkNewMerchant(
        dto.platformPercent,
        dto.tradeName,
      );

    const merchant = await this.prisma.merchant.create({
      data: {
        legalName: dto.legalName.trim(),
        tradeName: dto.tradeName.trim(),
        cuit,
        ivaCondition: dto.ivaCondition,
        contactEmail: dto.contactEmail.trim().toLowerCase(),
        contactName: dto.contactName?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        city: dto.city?.trim() || null,
        categories: dto.categories ?? [],
        createdByUid: actor.uid,
      },
    });
    await this.audit.record(
      actor,
      'merchant.create',
      { type: 'Merchant', id: merchant.id },
      { after: fiscal(merchant) },
    );

    if (dto.platformPercent !== undefined)
      await this.commissions.setRule(actor, {
        scope: 'MERCHANT',
        merchantId: merchant.id,
        platformPercent: dto.platformPercent,
        reason: 'Valor pactado al dar de alta el comercio',
      });

    const invitation = await this.invite(actor, merchant.id, {
      email: merchant.contactEmail,
      role: 'ADMIN_COMERCIO',
    });
    return { merchant: await this.get(merchant.id), invitation };
  }

  /** Datos fiscales: solo Fluxion, con motivo. Un CUIT nuevo exige verificarlo otra vez. */
  async updateFiscal(
    actor: AuditActor,
    id: string,
    dto: UpdateMerchantFiscalDto,
  ) {
    const before = await this.require(id);
    const data: Prisma.MerchantUpdateInput = {};
    if (dto.legalName !== undefined) data.legalName = dto.legalName.trim();
    if (dto.tradeName !== undefined) data.tradeName = dto.tradeName.trim();
    if (dto.ivaCondition !== undefined) data.ivaCondition = dto.ivaCondition;
    if (dto.contactEmail !== undefined)
      data.contactEmail = dto.contactEmail.trim().toLowerCase();
    if (dto.categories !== undefined) data.categories = dto.categories;
    if (dto.cuit !== undefined) {
      const cuit = normalizeCuit(dto.cuit);
      if (!isValidCuit(cuit))
        throw new BadRequestException('El CUIT no es válido.');
      if (cuit !== before.cuit) {
        const clash = await this.prisma.merchant.findUnique({
          where: { cuit },
        });
        if (clash)
          throw new ConflictException('Ya existe un comercio con ese CUIT.');
        data.cuit = cuit;
        data.cuitVerifiedAt = null;
        data.cuitVerifiedByUid = null;
        data.cuitVerificationNote = null;
      }
    }
    const after = await this.prisma.merchant.update({ where: { id }, data });
    await this.audit.record(
      actor,
      'merchant.update',
      { type: 'Merchant', id },
      { before: fiscal(before), after: fiscal(after), reason: dto.reason },
    );
    return this.get(id);
  }

  /** Verificación manual del CUIT y la actividad (constancia de AFIP, etc.). */
  async verifyCuit(actor: AuditActor, id: string, note: string) {
    const merchant = await this.require(id);
    await this.prisma.merchant.update({
      where: { id },
      data: {
        cuitVerifiedAt: new Date(),
        cuitVerifiedByUid: actor.uid,
        cuitVerificationNote: note,
      },
    });
    await this.audit.record(
      actor,
      'merchant.cuit.verify',
      { type: 'Merchant', id },
      { after: { cuit: merchant.cuit, note } },
    );
    await this.maybeActivate(actor, id);
    return this.get(id);
  }

  /**
   * Invitación de un solo uso: devuelve el token una sola vez (se guarda el hash).
   * Las invitaciones pendientes anteriores al mismo email quedan revocadas.
   */
  async invite(actor: AuditActor, id: string, dto: InviteMerchantDto) {
    const merchant = await this.require(id);
    if (merchant.status === 'SUSPENDIDO')
      throw new BadRequestException('El comercio está suspendido.');
    const email = (dto.email ?? merchant.contactEmail).trim().toLowerCase();
    const role = dto.role ?? 'ADMIN_COMERCIO';
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000);

    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.merchantInvitation.updateMany({
        where: { merchantId: id, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.merchantInvitation.create({
        data: {
          merchantId: id,
          email,
          role,
          tokenHash: hashToken(token),
          expiresAt,
          createdByUid: actor.uid,
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      });
    });
    await this.audit.record(
      actor,
      'merchant.invite',
      { type: 'Merchant', id },
      { after: { invitationId: invitation.id, email, role, expiresAt } },
    );
    return { ...invitation, token };
  }

  async revokeInvitation(actor: AuditActor, id: string, invitationId: string) {
    const invitation = await this.prisma.merchantInvitation.findFirst({
      where: { id: invitationId, merchantId: id },
    });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');
    if (invitation.acceptedAt || invitation.revokedAt)
      throw new BadRequestException('La invitación ya no está pendiente.');
    await this.prisma.merchantInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(
      actor,
      'merchant.invitation.revoke',
      { type: 'Merchant', id },
      { before: { invitationId, email: invitation.email } },
    );
    return this.get(id);
  }

  async suspend(actor: AuditActor, id: string, reason: string) {
    const merchant = await this.require(id);
    if (merchant.status === 'SUSPENDIDO')
      throw new BadRequestException('Ya está suspendido.');
    await this.prisma.merchant.update({
      where: { id },
      data: {
        status: 'SUSPENDIDO',
        suspendedAt: new Date(),
        suspendedReason: reason,
      },
    });
    await this.audit.record(
      actor,
      'merchant.suspend',
      { type: 'Merchant', id },
      {
        before: { status: merchant.status },
        after: { status: 'SUSPENDIDO' },
        reason,
      },
    );
    return this.get(id);
  }

  /** Vuelve a ACTIVO si cumple todo; si no, queda INVITADO hasta completar. */
  async reactivate(actor: AuditActor, id: string, reason: string) {
    const merchant = await this.require(id);
    if (merchant.status !== 'SUSPENDIDO')
      throw new BadRequestException('El comercio no está suspendido.');
    await this.prisma.merchant.update({
      where: { id },
      data: { status: 'INVITADO', suspendedAt: null, suspendedReason: null },
    });
    await this.audit.record(
      actor,
      'merchant.reactivate',
      { type: 'Merchant', id },
      {
        before: { status: 'SUSPENDIDO' },
        after: { status: 'INVITADO' },
        reason,
      },
    );
    await this.maybeActivate(actor, id);
    return this.get(id);
  }

  /**
   * Pasa a ACTIVO cuando: CUIT verificado por Fluxion, responsable aceptó la
   * invitación y hay cuenta de cobro conectada. Un suspendido no se activa solo.
   */
  async maybeActivate(actor: AuditActor, id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: { members: true, paymentAccount: true },
    });
    if (!merchant || merchant.status !== 'INVITADO') return false;
    const checklist = activationChecklist(merchant);
    if (!Object.values(checklist).every(Boolean)) return false;
    const { count } = await this.prisma.merchant.updateMany({
      where: { id, status: 'INVITADO' },
      data: { status: 'ACTIVO', activatedAt: new Date() },
    });
    if (count === 0) return false;
    await this.audit.record(
      actor,
      'merchant.activate',
      { type: 'Merchant', id },
      {
        before: { status: 'INVITADO' },
        after: { status: 'ACTIVO', checklist },
      },
    );
    return true;
  }

  private async require(id: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Comercio no encontrado');
    return merchant;
  }

  private present(
    merchant: Merchant &
      Prisma.MerchantGetPayload<{ include: typeof MERCHANT_DETAIL }> & {
        _count: { products: number; orders: number };
      },
    rules: Awaited<ReturnType<CommissionsService['currentRules']>>,
  ) {
    const own = rules.find(
      (rule) => rule.scope === 'MERCHANT' && rule.merchantId === merchant.id,
    );
    const now = Date.now();
    return {
      ...merchant,
      checklist: activationChecklist(merchant),
      platformPercent: own?.platformPercent ?? null,
      invitations: merchant.invitations.map((invitation) => ({
        ...invitation,
        state: invitation.acceptedAt
          ? 'ACEPTADA'
          : invitation.revokedAt
            ? 'REVOCADA'
            : invitation.expiresAt.getTime() < now
              ? 'VENCIDA'
              : 'PENDIENTE',
      })),
      productCount: merchant._count.products,
      orderCount: merchant._count.orders,
    };
  }
}
