import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { guardianEmailOf } from '../common/guardian';
import { DocStoreService } from '../docstore/docstore.service';
import { expiryOf } from '../player-documents/player-documents.service';
import {
  LATE_FEE_CLUB_SELECT,
  dayInZone,
  lateFeeConfigOf,
} from '../player-payments/late-fee';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateAccess } from './access-verdict';
import type { Light, MedicalState, Reason } from './access-verdict';
import {
  STEP_SECONDS,
  accessKey,
  signAccessToken,
  verifyAccessToken,
} from './access-token';

/** Un mismo atleta no se vuelve a registrar si ya fichó hace menos de esto. */
const REPEAT_MINUTES = 10;

export type ScanResult = {
  result: Light;
  reasons: Reason[];
  owed: number;
  repeat: boolean;
  at: string;
  player: { id: string; name: string; photoUrl: string | null } | null;
};

@Injectable()
export class AccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: DocStoreService,
  ) {}

  /** El QR vivo del atleta (o de un hijo/a): el propio atleta o el tutor con email verificado. */
  async tokenFor(
    auth: { uid?: string; email?: string; emailVerified?: boolean },
    playerId?: string,
  ) {
    if (!accessKey())
      throw new ServiceUnavailableException('El fichaje por QR no está configurado');
    let id = playerId;
    if (!id) {
      const own = auth.uid
        ? await this.prisma.player.findFirst({
            where: { authUid: auth.uid },
            select: { id: true },
          })
        : null;
      if (!own) throw new NotFoundException('No tenés un legajo de atleta');
      id = own.id;
    } else {
      const player = await this.prisma.player.findUnique({
        where: { id },
        select: { authUid: true, extra: true },
      });
      if (!player) throw new NotFoundException('Atleta no encontrado');
      const isSelf = !!auth.uid && player.authUid === auth.uid;
      const email = auth.email?.trim().toLowerCase();
      const isGuardian =
        !!email &&
        auth.emailVerified === true &&
        guardianEmailOf(player.extra) === email;
      if (!isSelf && !isGuardian)
        throw new ForbiddenException('Este atleta no está vinculado a tu cuenta');
    }
    return {
      playerId: id,
      token: signAccessToken(id),
      refreshInSeconds: STEP_SECONDS,
      serverTime: new Date().toISOString(),
    };
  }

  async scan(
    companyId: string,
    clubId: string,
    scannedBy: string | undefined,
    token: string,
  ): Promise<ScanResult> {
    const at = new Date();
    const stop = (code: string, message: string): ScanResult => ({
      result: 'red',
      reasons: [{ code, message }],
      owed: 0,
      repeat: false,
      at: at.toISOString(),
      player: null,
    });

    const check = verifyAccessToken(token);
    if (!check.ok)
      return check.reason === 'expired'
        ? stop('qr_expired', 'QR vencido: pedile que abra el carnet en la app (no sirve la captura)')
        : stop('qr_invalid', 'QR inválido');

    const player = await this.prisma.player.findFirst({
      where: { id: check.playerId, companyId, clubId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        active: true,
      },
    });
    if (!player) return stop('other_club', 'Este carnet no es de este club');

    const [club, fees, medical] = await Promise.all([
      this.prisma.club.findUnique({
        where: { id: clubId },
        select: LATE_FEE_CLUB_SELECT,
      }),
      this.prisma.playerPayment.findMany({
        where: { playerId: player.id, status: { in: ['pending', 'overdue'] } },
        select: { amount: true, month: true, year: true, dueDate: true },
      }),
      this.medicalState(companyId, clubId, player.id),
    ]);
    const timeZone = club?.timezone || 'America/Argentina/Buenos_Aires';
    const verdict = evaluateAccess({
      active: player.active !== false,
      fees: fees.map((f) => ({ ...f, amount: Number(f.amount) })),
      lateFee: lateFeeConfigOf(club),
      medical,
      now: at,
      timeZone,
      today: dayInZone(at, timeZone),
    });

    const since = new Date(at.getTime() - REPEAT_MINUTES * 60_000);
    const recent = await this.prisma.accessLog.findFirst({
      where: { playerId: player.id, clubId, createdAt: { gte: since } },
      select: { id: true },
    });
    if (!recent)
      await this.prisma.accessLog.create({
        data: {
          companyId,
          clubId,
          playerId: player.id,
          result: verdict.result,
          reasons: verdict.reasons,
          scannedBy: scannedBy ?? null,
        },
      });

    return {
      result: verdict.result,
      reasons: verdict.reasons,
      owed: verdict.owed,
      repeat: !!recent,
      at: at.toISOString(),
      player: {
        id: player.id,
        name: `${player.firstName} ${player.lastName}`.trim(),
        photoUrl: player.photoUrl,
      },
    };
  }

  /** Últimos fichajes del club, con el nombre del atleta. */
  async recent(companyId: string, clubId: string, limit = 30) {
    const rows = await this.prisma.accessLog.findMany({
      where: { companyId, clubId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    const players = await this.prisma.player.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.playerId))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const name = new Map(
      players.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]),
    );
    return rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      name: name.get(r.playerId) ?? 'Atleta',
      result: r.result,
      reasons: (r.reasons as Reason[] | null) ?? [],
      at: r.createdAt.toISOString(),
    }));
  }

  private async medicalState(
    companyId: string,
    clubId: string,
    playerId: string,
  ): Promise<MedicalState> {
    try {
      const rows = await this.store.query(
        { uid: '', role: 'admin', clubId, companyId },
        { path: `clubs/${clubId}/players/${playerId}/documents` },
      );
      const doc = rows
        .map((r) => ({ ...(r.data as { slot?: string; expiresAt?: string }), id: r.id }))
        .find((d) => d.id === 'medical' || d.slot === 'medical');
      if (!doc) return 'missing';
      const e = expiryOf(doc.expiresAt);
      return e === 'expired' ? 'expired' : e === 'soon' ? 'soon' : 'ok';
    } catch {
      // Sin poder leer los documentos no se bloquea la puerta por eso.
      return 'ok';
    }
  }
}
