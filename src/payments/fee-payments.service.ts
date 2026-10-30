import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { loadClubCompetitions } from './guardian-competitions';
import { roundMoney } from '../bookings/booking-time';
import { buildClubFeed } from '../matches/club-feed';
import { toPublicMenu } from '../buffet/buffet.logic';
import { PrismaService } from '../prisma/prisma.service';
import {
  MercadoPagoClient,
  mpConfig,
  type MpPayment,
} from './mercadopago.client';
import { PaymentAccountsService } from './payment-accounts.service';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Referencia externa de Mercado Pago de una cuota (la de reservas es el id pelado). */
export const feeReference = (feeId: string) => `fee:${feeId}`;

/**
 * Cobro de cuotas de socio por Mercado Pago: la plata va directo a la cuenta
 * conectada del club (la misma de las reservas). El estado de la cuota solo
 * cambia cuando se consulta el pago a la API de Mercado Pago con el token del
 * club; la notificación del webhook o la vuelta del checkout nunca bastan.
 */
function guardianEmailOf(extra: unknown): string | null {
  const value = (extra as Record<string, unknown> | null)?.guardianEmail;
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function isMinorWithGuardian(player: { birthDate: Date | null; extra: unknown }) {
  if (!guardianEmailOf(player.extra) || !player.birthDate) return false;
  const adult = new Date(player.birthDate);
  adult.setFullYear(adult.getFullYear() + 18);
  return adult.getTime() > Date.now();
}

@Injectable()
export class FeePaymentsService {
  private readonly logger = new Logger(FeePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoClient,
    private readonly accounts: PaymentAccountsService,
  ) {}

  /** La cuota es del propio socio/jugador (ficha vinculada a su cuenta). */
  private async assertOwner(
    firebaseUid: string,
    fee: { clubId: string; playerId: string },
  ) {
    const [player, membership] = await Promise.all([
      this.prisma.player.findFirst({
        where: { id: fee.playerId, authUid: firebaseUid },
        select: { id: true },
      }),
      this.prisma.clubMembership.findFirst({
        where: {
          clubId: fee.clubId,
          playerId: fee.playerId,
          status: 'ACTIVA',
          user: { is: { firebaseUid } },
        },
        select: { id: true },
      }),
    ]);
    if (!player && !membership)
      throw new ForbiddenException('Esta cuota no es de tu cuenta');
    const record = await this.prisma.player.findUnique({
      where: { id: fee.playerId },
      select: { birthDate: true, extra: true },
    });
    if (record && isMinorWithGuardian(record))
      throw new ForbiddenException(
        'Esta cuota la abona el padre/tutor vinculado',
      );
  }

  /** La cuota es de un atleta a cargo del usuario (email del tutor verificado). */
  async assertGuardian(
    auth: { email?: string; emailVerified?: boolean },
    playerId: string,
  ) {
    const email = auth.email?.trim().toLowerCase();
    if (!email || auth.emailVerified !== true)
      throw new ForbiddenException('Verificá tu email para ver a tu hijo/a');
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { extra: true },
    });
    if (!player || guardianEmailOf(player.extra) !== email)
      throw new ForbiddenException('Este atleta no está vinculado a tu cuenta');
  }

  /** Partidos de los clubes de los hijos del padre/tutor (en vivo, próximos y últimos resultados). */
  async clubMatchesForGuardian(auth: { email?: string; emailVerified?: boolean }) {
    const children = await this.listChildren(auth);
    const clubs = new Map<string, string>();
    for (const c of children) clubs.set(c.clubId, c.companyId);
    const feeds = await Promise.all(
      [...clubs.entries()].map(async ([clubId, companyId]) => ({
        clubId,
        ...(await buildClubFeed(this.prisma, companyId, clubId)),
      })),
    );
    return feeds;
  }

  /** Torneos, tablas de posiciones y fixture completo de los clubes de mis hijos. */
  async competitionsForGuardian(auth: { email?: string; emailVerified?: boolean }) {
    const children = await this.listChildren(auth);
    const clubs = new Map<string, string>();
    for (const c of children) clubs.set(c.clubId, c.companyId);
    return Promise.all(
      [...clubs.entries()].map(async ([clubId, companyId]) => ({
        clubId,
        tournaments: await loadClubCompetitions(this.prisma, companyId, clubId),
      })),
    );
  }

  /** Carta del buffet de los clubes de mis hijos (solo lectura: sin costos ni stock). */
  async buffetMenuForGuardian(auth: { email?: string; emailVerified?: boolean }) {
    const children = await this.listChildren(auth);
    const clubs = new Map<string, { companyId: string; clubName: string | null }>();
    for (const c of children) clubs.set(c.clubId, { companyId: c.companyId, clubName: c.clubName });
    const menus = await Promise.all(
      [...clubs.entries()].map(async ([clubId, { companyId, clubName }]) => {
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
          clubName,
          buffetName: buffet.name,
          concessionaire: buffet.concessionaire ?? null,
          open: !!openSession,
          products: items,
        };
      }),
    );
    return menus.filter((m): m is NonNullable<typeof m> => m !== null);
  }

  async listChildren(auth: { email?: string; emailVerified?: boolean }) {
    const email = auth.email?.trim().toLowerCase();
    if (!email || auth.emailVerified !== true) return [];
    const candidates = await this.prisma.player.findMany({
      where: {
        extra: { path: ['guardianEmail'], string_contains: email, mode: 'insensitive' },
      },
      select: {
        id: true,
        companyId: true,
        clubId: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        birthDate: true,
        extra: true,
        position: true,
        sport: true,
        divisionId: true,
        branch: true,
        club: { select: { name: true } },
      },
    });
    const children = candidates.filter(
      (p) => guardianEmailOf(p.extra) === email,
    );
    const pending = await this.prisma.playerPayment.groupBy({
      by: ['playerId'],
      where: {
        playerId: { in: children.map((c) => c.id) },
        status: 'pending',
      },
      _count: { _all: true },
    });
    const pendingBy = new Map(pending.map((r) => [r.playerId, r._count._all]));
    const teams = await this.loadChildTeams(children);
    return children.map((c) => {
      const extra = (c.extra ?? {}) as Record<string, unknown>;
      const team = teams.get(c.id) ?? null;
      return {
        team,
        playerId: c.id,
        companyId: c.companyId,
        clubId: c.clubId,
        clubName: c.club?.name ?? null,
        teamId:
          typeof extra.teamId === 'string' && extra.teamId !== c.divisionId
            ? extra.teamId
            : (team?.id ?? null),
        teamName: typeof extra.teamName === 'string' ? extra.teamName : null,
        divisionId:
          c.divisionId ??
          (typeof extra.divisionId === 'string' ? extra.divisionId : null),
        divisionName:
          typeof extra.divisionName === 'string' ? extra.divisionName : null,
        sport: c.sport ?? null,
        position: c.position ?? null,
        secondaryPosition:
          typeof extra.secondaryPosition === 'string'
            ? extra.secondaryPosition
            : null,
        jerseyNumber:
          typeof extra.jerseyNumber === 'number' ? extra.jerseyNumber : null,
        heightCm: typeof extra.heightCm === 'number' ? extra.heightCm : null,
        weightKg: typeof extra.weightKg === 'number' ? extra.weightKg : null,
        dominantSide:
          typeof extra.dominantSide === 'string' ? extra.dominantSide : null,
        firstName: c.firstName,
        lastName: c.lastName,
        photoUrl: c.photoUrl,
        birthDate: c.birthDate?.toISOString() ?? null,
        pendingFees: pendingBy.get(c.id) ?? 0,
      };
    });
  }

  /**
   * Plantel (entrenador, horarios) de cada hijo. El padre no tiene club propio, por eso no puede
   * leer los documentos del club desde la consola: se lo entrega el servidor. Si la ficha no trae
   * equipo y la rama tiene uno solo, se usa ese.
   */
  private async loadChildTeams(
    children: Array<{
      id: string;
      companyId: string;
      clubId: string;
      divisionId: string | null;
      extra: unknown;
    }>,
  ) {
    const result = new Map<string, Record<string, unknown>>();
    const wantedPaths = new Set<string>();
    const wantedParents = new Set<string>();
    const pathOf = new Map<string, string>();
    for (const c of children) {
      const extra = (c.extra ?? {}) as Record<string, unknown>;
      const divisionId =
        c.divisionId ??
        (typeof extra.divisionId === 'string' ? extra.divisionId : null);
      if (!c.clubId || !divisionId) continue;
      const teamId = typeof extra.teamId === 'string' ? extra.teamId : '';
      const base = `clubs/${c.clubId}/divisions/${divisionId}/teams`;
      if (teamId && teamId !== divisionId) {
        wantedPaths.add(`${base}/${teamId}`);
        pathOf.set(c.id, `${base}/${teamId}`);
      } else {
        wantedParents.add(base);
        pathOf.set(c.id, base);
      }
    }
    if (pathOf.size === 0) return result;
    const rows = await this.prisma.storeDocument.findMany({
      where: {
        OR: [
          ...(wantedPaths.size ? [{ path: { in: [...wantedPaths] } }] : []),
          ...(wantedParents.size
            ? [{ parentPath: { in: [...wantedParents] } }]
            : []),
        ],
      },
      select: { path: true, parentPath: true, docId: true, companyId: true, data: true },
    });
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const shape = (row: { docId: string; data: unknown }) => {
      const d = (row.data ?? {}) as Record<string, unknown>;
      return {
        id: row.docId,
        name: str(d.name) || null,
        season: str(d.season) || null,
        coachName: str(d.coachName) || null,
        assistantCoachName: str(d.assistantCoachName) || null,
        trainingDays: Array.isArray(d.trainingDays)
          ? d.trainingDays.filter((x): x is string => typeof x === 'string')
          : [],
        trainingStartTime: str(d.trainingStartTime) || null,
        trainingEndTime: str(d.trainingEndTime) || null,
        mainVenue: str(d.mainVenue) || null,
      };
    };
    for (const c of children) {
      const key = pathOf.get(c.id);
      if (!key) continue;
      const own = (r: { companyId: string | null }) =>
        !r.companyId || r.companyId === c.companyId;
      const exact = rows.find((r) => r.path === key && own(r));
      if (exact) {
        result.set(c.id, shape(exact));
        continue;
      }
      const siblings = rows.filter((r) => r.parentPath === key && own(r));
      if (siblings.length === 1) result.set(c.id, shape(siblings[0]));
    }
    return result;
  }

  async listChildFees(
    auth: { email?: string; emailVerified?: boolean },
    playerId: string,
  ) {
    await this.assertGuardian(auth, playerId);
    return this.prisma.playerPayment.findMany({
      where: { playerId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async checkoutForGuardian(
    auth: { uid: string; email?: string; emailVerified?: boolean },
    playerId: string,
    feeId: string,
  ) {
    const fee = await this.loadGuardianFee(auth, playerId, feeId);
    return this.createCheckout(fee.companyId, auth.uid, feeId, 'parent', true);
  }

  async syncForGuardian(
    auth: { uid: string; email?: string; emailVerified?: boolean },
    playerId: string,
    feeId: string,
    paymentId: string,
  ) {
    if (!/^\d{1,20}$/.test(paymentId))
      throw new BadRequestException('Pago inválido');
    await this.loadGuardianFee(auth, playerId, feeId);
    await this.applyPayment(feeId, paymentId);
    return this.prisma.playerPayment.findUnique({
      where: { id: feeId },
      select: { status: true, paymentDate: true, mpPaymentStatus: true },
    });
  }

  private async loadGuardianFee(
    auth: { email?: string; emailVerified?: boolean },
    playerId: string,
    feeId: string,
  ) {
    await this.assertGuardian(auth, playerId);
    const fee = await this.prisma.playerPayment.findFirst({
      where: { id: feeId, playerId },
      select: { id: true, companyId: true },
    });
    if (!fee) throw new NotFoundException('Cuota no encontrada');
    return fee;
  }

  private async loadForOwner(
    companyId: string,
    firebaseUid: string,
    feeId: string,
  ) {
    const fee = await this.prisma.playerPayment.findFirst({
      where: { id: feeId, companyId },
      include: { club: { select: { name: true } } },
    });
    if (!fee) throw new NotFoundException('Cuota no encontrada');
    await this.assertOwner(firebaseUid, fee);
    return fee;
  }

  /** Crea el link de pago (Checkout Pro) de una cuota pendiente. */
  async createCheckout(
    companyId: string,
    firebaseUid: string,
    feeId: string,
    role?: string,
    guardianChecked = false,
  ) {
    const fee = guardianChecked
      ? await this.prisma.playerPayment.findFirstOrThrow({
          where: { id: feeId, companyId },
          include: { club: { select: { name: true } } },
        })
      : await this.loadForOwner(companyId, firebaseUid, feeId);
    if (fee.status === 'paid')
      throw new ConflictException('Esta cuota ya está pagada');

    const amount = roundMoney(Number(fee.amount));
    if (!(amount > 0))
      throw new BadRequestException('La cuota no tiene un monto a cobrar');
    if (!(await this.accounts.isConnected(fee.clubId)))
      throw new BadRequestException(
        'El club todavía no habilitó el pago online. Abonala en la secretaría.',
      );

    const user = await this.prisma.user.findFirst({
      where: { firebaseUid },
      select: { email: true },
    });
    const config = mpConfig();
    const accessToken = await this.accounts.accessTokenFor(fee.clubId);
    const preference = await this.mp.createPreference(accessToken, {
      title:
        `Cuota ${MONTHS[fee.month - 1] ?? fee.month} ${fee.year} - ${fee.club.name}`.slice(
          0,
          250,
        ),
      amount,
      currency: 'ARS',
      externalReference: feeReference(fee.id),
      payerEmail: user?.email,
      notificationUrl: `${config.publicApiUrl}/payments/mercadopago/webhook?fee=${fee.id}`,
      backUrl: `${config.publicAppUrl}/dashboard/${role === 'parent' ? 'parent' : role === 'player' ? 'player' : 'member'}/payments?cuota=${fee.id}`,
      // 48 h para completar el pago; después hay que generar otro link.
      expiresAt: new Date(Date.now() + 48 * 3_600_000),
      // El monto va en la clave: si el club corrige la cuota, no se reutiliza el link viejo.
      idempotencyKey: `pref-fee:${fee.id}:${amount}`,
    });
    await this.prisma.playerPayment.update({
      where: { id: fee.id },
      data: { mpPreferenceId: preference.id },
    });
    return {
      checkoutUrl: config.testMode
        ? (preference.sandbox_init_point ?? preference.init_point)
        : preference.init_point,
    };
  }

  /** Vuelta del checkout: el socio vuelve al portal y confirmamos sin esperar el webhook. */
  async syncForOwner(
    companyId: string,
    firebaseUid: string,
    feeId: string,
    paymentId: string,
  ) {
    if (!/^\d{1,20}$/.test(paymentId))
      throw new BadRequestException('Pago inválido');
    await this.loadForOwner(companyId, firebaseUid, feeId);
    await this.applyPayment(feeId, paymentId);
    const fee = await this.prisma.playerPayment.findUnique({
      where: { id: feeId },
      select: { status: true, paymentDate: true, mpPaymentStatus: true },
    });
    return fee;
  }

  /** Aplica el estado real de un pago a la cuota. Idempotente (webhook + vuelta). */
  async applyPayment(feeId: string, paymentId: string) {
    const fee = await this.prisma.playerPayment.findUnique({
      where: { id: feeId },
      include: { club: { select: { name: true } } },
    });
    if (!fee) throw new NotFoundException('Cuota no encontrada');

    const accessToken = await this.accounts.accessTokenFor(fee.clubId);
    const payment = await this.mp.getPayment(accessToken, paymentId);

    if (payment.external_reference !== feeReference(fee.id)) {
      this.logger.warn(`Pago ${paymentId} no corresponde a la cuota ${fee.id}`);
      throw new BadRequestException('El pago no corresponde a esta cuota');
    }

    if (payment.status !== 'approved') {
      // rechazado / en proceso / devuelto: solo se registra; la cuota sigue como está.
      await this.prisma.playerPayment.update({
        where: { id: fee.id },
        data: {
          mpPaymentStatus: payment.status,
          ...(fee.mpPaymentId ? {} : { mpPaymentId: String(payment.id) }),
        },
      });
      return;
    }

    const amountOk = payment.transaction_amount + 0.001 >= Number(fee.amount);
    if (!amountOk || payment.currency_id !== 'ARS') {
      // Cobrado pero no coincide (la cuota cambió después de generar el link):
      // no se marca paga sola; queda a la vista del club para revisarla.
      this.logger.error(
        `Pago ${payment.id} con monto/moneda distinto para la cuota ${fee.id}`,
      );
      await this.prisma.playerPayment.update({
        where: { id: fee.id },
        data: {
          mpPaymentId: String(payment.id),
          mpPaymentStatus: 'amount_mismatch',
        },
      });
      await this.recordInTreasury(fee, payment);
      return;
    }

    const updated = await this.prisma.playerPayment.updateMany({
      where: { id: fee.id, status: { not: 'paid' } },
      data: {
        status: 'paid',
        paymentMethod: 'mercadopago',
        paymentDate: payment.date_approved
          ? new Date(payment.date_approved)
          : new Date(),
        mpPaymentId: String(payment.id),
        mpPaymentStatus: 'approved',
      },
    });
    if (updated.count === 0 && fee.mpPaymentId !== String(payment.id)) {
      this.logger.warn(
        `Pago ${payment.id} sobre la cuota ${fee.id}, que ya estaba paga: revisar posible devolución`,
      );
    }
    await this.recordInTreasury(fee, payment);
  }

  /**
   * Cuota cobrada → ingreso en Tesorería y la comisión de Mercado Pago como gasto.
   * Idempotente: la referencia mp:<pago> es única en la base (igual que las señas).
   */
  private async recordInTreasury(
    fee: { companyId: string; clubId: string; month: number; year: number },
    payment: MpPayment,
  ) {
    const occurredAt = payment.date_approved
      ? new Date(payment.date_approved)
      : new Date();
    const label = `${MONTHS[fee.month - 1] ?? fee.month} ${fee.year}`;
    const mpFee = roundMoney(
      (payment.fee_details ?? []).reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0,
      ),
    );
    try {
      await this.prisma.financialTransaction.createMany({
        skipDuplicates: true,
        data: [
          {
            companyId: fee.companyId,
            clubId: fee.clubId,
            type: 'income',
            category: 'Cuotas sociales',
            amount: payment.transaction_amount,
            currency: payment.currency_id,
            occurredAt,
            description: `Cuota de socio ${label} (Mercado Pago)`,
            reference: `mp:${payment.id}`,
          },
          ...(mpFee > 0
            ? [
                {
                  companyId: fee.companyId,
                  clubId: fee.clubId,
                  type: 'expense' as const,
                  category: 'Comisión Mercado Pago',
                  amount: mpFee,
                  currency: payment.currency_id,
                  occurredAt,
                  description: `Comisión por la cuota ${label}`,
                  reference: `mp-fee:${payment.id}`,
                },
              ]
            : []),
        ],
      });
    } catch (error) {
      // Tesorería no debe frenar la confirmación de la cuota.
      this.logger.error(
        `No se registró en Tesorería el pago ${payment.id}: ${String(error)}`,
      );
    }
  }
}
