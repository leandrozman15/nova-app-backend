import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService, type AuditActor } from '../platform/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  findConflict,
  resolveRates,
  split,
  type Limits,
  type RuleRow,
} from './commission';
import type {
  ClearCommissionRuleDto,
  CommissionLimitsDto,
  CommissionPreviewDto,
  CommissionReportDto,
  SetCommissionRuleDto,
} from './dto/store.dto';

const SETTINGS_ID = 'global';
type Db = PrismaService | Prisma.TransactionClient;

type RawRule = {
  id: string;
  scope: RuleRow['scope'];
  clubId: string | null;
  merchantId: string | null;
  platformPercent: Prisma.Decimal | null;
  clubPercent: Prisma.Decimal | null;
  version: number;
};

const toRow = (rule: RawRule): RuleRow => ({
  id: rule.id,
  scope: rule.scope,
  clubId: rule.clubId,
  merchantId: rule.merchantId,
  platformPercent:
    rule.platformPercent === null ? null : Number(rule.platformPercent),
  clubPercent: rule.clubPercent === null ? null : Number(rule.clubPercent),
  version: rule.version,
});

const num = (value: Prisma.Decimal | number | null) =>
  value === null ? null : Number(value);

/** Comisiones de la tienda: reglas versionadas, rangos, vista previa y reporte. */
@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async currentRules(db: Db = this.prisma): Promise<RuleRow[]> {
    const rules = await db.commissionRule.findMany({
      where: { validTo: null },
    });
    return rules.map(toRow);
  }

  async limits(db: Db = this.prisma): Promise<Limits> {
    const settings = await db.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
    return {
      platformMin: Number(settings.commissionPlatformMin),
      platformMax: Number(settings.commissionPlatformMax),
      clubMin: Number(settings.commissionClubMin),
      clubMax: Number(settings.commissionClubMax),
    };
  }

  /** Porcentajes vigentes para una venta (con las reglas usadas, para el snapshot). */
  async resolve(
    context: { merchantId: string | null; clubId: string },
    db: Db = this.prisma,
  ) {
    return resolveRates(await this.currentRules(db), context);
  }

  /** Configuración completa para el panel. */
  async overview() {
    const [rules, limits] = await Promise.all([
      this.currentRules(),
      this.limits(),
    ]);
    const names = await this.names(rules);
    return {
      limits,
      global: rules.find((rule) => rule.scope === 'GLOBAL') ?? null,
      clubs: rules
        .filter((rule) => rule.scope === 'CLUB')
        .map((rule) => ({
          ...rule,
          name: names.clubs.get(rule.clubId!) ?? '—',
        })),
      merchants: rules
        .filter((rule) => rule.scope === 'MERCHANT')
        .map((rule) => ({
          ...rule,
          name: names.merchants.get(rule.merchantId!) ?? '—',
        })),
    };
  }

  async history(filter: {
    scope?: string;
    clubId?: string;
    merchantId?: string;
  }) {
    const rules = await this.prisma.commissionRule.findMany({
      where: {
        ...(filter.scope && { scope: filter.scope as RuleRow['scope'] }),
        ...(filter.clubId && { clubId: filter.clubId }),
        ...(filter.merchantId && { merchantId: filter.merchantId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const names = await this.names(rules.map(toRow));
    return rules.map((rule) => ({
      ...toRow(rule),
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      reason: rule.reason,
      createdByUid: rule.createdByUid,
      name:
        rule.scope === 'CLUB'
          ? names.clubs.get(rule.clubId!)
          : rule.scope === 'MERCHANT'
            ? names.merchants.get(rule.merchantId!)
            : 'General',
    }));
  }

  /** Crea una versión nueva de la regla (la anterior queda cerrada, no se edita). */
  async setRule(actor: AuditActor, dto: SetCommissionRuleDto) {
    const target = this.target(dto);
    const platformPercent = dto.platformPercent ?? null;
    const clubPercent = dto.clubPercent ?? null;

    if (
      dto.scope === 'GLOBAL' &&
      (platformPercent === null || clubPercent === null)
    )
      throw new BadRequestException(
        'La regla general necesita los dos porcentajes.',
      );
    if (dto.scope === 'MERCHANT' && platformPercent === null)
      throw new BadRequestException(
        'Indicá la comisión de Fluxion para el comercio.',
      );
    if (dto.scope === 'MERCHANT' && clubPercent !== null)
      throw new BadRequestException(
        'La parte del club se configura por club, no por comercio.',
      );
    if (
      dto.scope === 'CLUB' &&
      platformPercent === null &&
      clubPercent === null
    )
      throw new BadRequestException(
        'Indicá al menos un porcentaje para el club.',
      );

    await this.requireTarget(target);

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.commissionRule.findFirst({
        where: { ...target, validTo: null },
      });
      const last = await tx.commissionRule.findFirst({
        where: target,
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const draft: RuleRow = {
        id: 'draft',
        scope: dto.scope,
        clubId: target.clubId,
        merchantId: target.merchantId,
        platformPercent,
        clubPercent,
        version: (last?.version ?? 0) + 1,
      };
      const rules = (await this.currentRules(tx)).filter(
        (rule) => rule.id !== current?.id,
      );
      rules.push(draft);
      await this.assertValid(rules, await this.limits(tx));

      const now = new Date();
      if (current)
        await tx.commissionRule.update({
          where: { id: current.id },
          data: { validTo: now },
        });
      const created = await tx.commissionRule.create({
        data: {
          scope: dto.scope,
          clubId: target.clubId,
          merchantId: target.merchantId,
          platformPercent,
          clubPercent,
          version: draft.version,
          validFrom: now,
          reason: dto.reason,
          createdByUid: actor.uid,
        },
      });
      return { current, created };
    });

    await this.audit.record(
      actor,
      'commission.rule.set',
      { type: 'CommissionRule', id: result.created.id },
      {
        before: result.current ? this.snapshot(result.current) : null,
        after: this.snapshot(result.created),
        reason: dto.reason,
      },
    );
    return toRow(result.created);
  }

  /** Valida la comisión de un comercio que todavía no existe (alta). */
  async checkNewMerchant(platformPercent: number, tradeName: string) {
    const rules = await this.currentRules();
    rules.push({
      id: 'draft',
      scope: 'MERCHANT',
      clubId: null,
      merchantId: '__new__',
      platformPercent,
      clubPercent: null,
      version: 1,
    });
    await this.assertValid(rules, await this.limits(), { __new__: tradeName });
  }

  /** Quita la regla propia de un club o comercio (vuelve a heredar). */
  async clearRule(actor: AuditActor, dto: ClearCommissionRuleDto) {
    const target = this.target(dto);
    const current = await this.prisma.commissionRule.findFirst({
      where: { ...target, validTo: null },
    });
    if (!current) throw new NotFoundException('No tiene una regla propia.');

    const rules = (await this.currentRules()).filter(
      (rule) => rule.id !== current.id,
    );
    await this.assertValid(rules, await this.limits());

    await this.prisma.commissionRule.update({
      where: { id: current.id },
      data: { validTo: new Date() },
    });
    await this.audit.record(
      actor,
      'commission.rule.clear',
      { type: 'CommissionRule', id: current.id },
      { before: this.snapshot(current), after: null, reason: dto.reason },
    );
    return { ok: true };
  }

  async setLimits(actor: AuditActor, dto: CommissionLimitsDto) {
    if (dto.platformMin > dto.platformMax || dto.clubMin > dto.clubMax)
      throw new BadRequestException('El mínimo no puede superar al máximo.');
    const before = await this.limits();
    const next: Limits = {
      platformMin: dto.platformMin,
      platformMax: dto.platformMax,
      clubMin: dto.clubMin,
      clubMax: dto.clubMax,
    };
    // Los valores vigentes tienen que seguir dentro de los rangos nuevos.
    await this.assertValid(await this.currentRules(), next);
    await this.prisma.platformSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        commissionPlatformMin: next.platformMin,
        commissionPlatformMax: next.platformMax,
        commissionClubMin: next.clubMin,
        commissionClubMax: next.clubMax,
        updatedByUid: actor.uid,
      },
    });
    await this.audit.record(
      actor,
      'commission.limits.update',
      { type: 'PlatformSettings', id: SETTINGS_ID },
      { before, after: next, reason: dto.reason },
    );
    return next;
  }

  /** "En una venta de $X, el comercio recibe A, el club B y Fluxion C". */
  async preview(dto: CommissionPreviewDto) {
    const rules = await this.currentRules();
    const rates = resolveRates(rules, {
      merchantId: dto.merchantId ?? 'preview:any-merchant',
      clubId: dto.clubId ?? 'preview:any-club',
    });
    return {
      amount: dto.amount,
      ...rates,
      ...split(dto.amount, rates.platformPercent, rates.clubPercent),
    };
  }

  /** Comisión pedido por pedido, desde el snapshot de cada uno. */
  async report(dto: CommissionReportDto) {
    let createdAt: Prisma.DateTimeFilter | undefined;
    if (dto.period) {
      const [year, month] = dto.period.split('-').map(Number);
      createdAt = {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lt: new Date(Date.UTC(year, month, 1)),
      };
    }
    const orders = await this.prisma.storeOrder.findMany({
      where: {
        ...(dto.merchantId && { merchantId: dto.merchantId }),
        ...(dto.clubId && {
          OR: [{ pickupClubId: dto.clubId }, { sellerClubId: dto.clubId }],
        }),
        ...(dto.commissionStatus && { commissionStatus: dto.commissionStatus }),
        ...(createdAt && { createdAt }),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        code: true,
        status: true,
        sellerType: true,
        subtotal: true,
        platformPercent: true,
        clubPercent: true,
        platformAmount: true,
        clubAmount: true,
        sellerAmount: true,
        commissionRules: true,
        commissionStatus: true,
        commissionAccruedAt: true,
        createdAt: true,
        merchant: { select: { id: true, tradeName: true } },
        sellerClub: { select: { id: true, name: true } },
        pickupClub: { select: { id: true, name: true } },
      },
    });

    const rows = orders.map((order) => {
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
      };
    });

    const totals = { sales: 0, platform: 0, club: 0, fluxion: 0 };
    for (const row of rows) {
      if (row.commissionStatus === 'VOID') continue;
      totals.sales += row.subtotal;
      totals.platform += row.platformAmount;
      totals.club += row.clubAmount;
      totals.fluxion += row.fluxionAmount;
    }
    for (const key of Object.keys(totals) as Array<keyof typeof totals>)
      totals[key] = Math.round(totals[key] * 100) / 100;
    return { rows, totals };
  }

  private target(dto: { scope: string; clubId?: string; merchantId?: string }) {
    return {
      scope: dto.scope as RuleRow['scope'],
      clubId: dto.scope === 'CLUB' ? dto.clubId! : null,
      merchantId: dto.scope === 'MERCHANT' ? dto.merchantId! : null,
    };
  }

  private async requireTarget(target: {
    clubId: string | null;
    merchantId: string | null;
  }) {
    if (target.clubId) {
      const club = await this.prisma.club.findUnique({
        where: { id: target.clubId },
        select: { id: true },
      });
      if (!club) throw new NotFoundException('Club no encontrado');
    }
    if (target.merchantId) {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: target.merchantId },
        select: { id: true },
      });
      if (!merchant) throw new NotFoundException('Comercio no encontrado');
    }
  }

  private async assertValid(
    rules: RuleRow[],
    limits: Limits,
    extraNames: Record<string, string> = {},
  ) {
    const names = await this.names(rules);
    const conflict = findConflict(rules, limits, {
      club: (id) => names.clubs.get(id) ?? id,
      merchant: (id) => extraNames[id] ?? names.merchants.get(id) ?? id,
    });
    if (conflict) throw new BadRequestException(conflict);
  }

  private async names(rules: RuleRow[]) {
    const clubIds = rules.flatMap((rule) => (rule.clubId ? [rule.clubId] : []));
    const merchantIds = rules.flatMap((rule) =>
      rule.merchantId ? [rule.merchantId] : [],
    );
    const [clubs, merchants] = await Promise.all([
      clubIds.length
        ? this.prisma.club.findMany({
            where: { id: { in: clubIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      merchantIds.length
        ? this.prisma.merchant.findMany({
            where: { id: { in: merchantIds } },
            select: { id: true, tradeName: true },
          })
        : Promise.resolve([] as Array<{ id: string; tradeName: string }>),
    ]);
    return {
      clubs: new Map(clubs.map((club) => [club.id, club.name])),
      merchants: new Map(merchants.map((item) => [item.id, item.tradeName])),
    };
  }

  private snapshot(rule: RawRule & { validFrom?: Date }) {
    return {
      scope: rule.scope,
      clubId: rule.clubId,
      merchantId: rule.merchantId,
      platformPercent: num(rule.platformPercent),
      clubPercent: num(rule.clubPercent),
      version: rule.version,
    };
  }
}
