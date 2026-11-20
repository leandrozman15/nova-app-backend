import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getMessaging } from 'firebase-admin/messaging';

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastDto, RegisterDeviceDto } from './dto/push.dto';
import { DEAD_TOKEN_CODES, audienceTokens, chunk, normEmail } from './push-rules';

type Auth = { uid: string; email?: string; emailVerified?: boolean };

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Garantiza que Firebase Admin esté inicializado antes de usar getMessaging().
    private readonly firebase: FirebaseAdminService,
  ) {}

  /** Alta o renovación del dispositivo del usuario. El email solo se guarda si está verificado. */
  async register(auth: Auth, dto: RegisterDeviceDto) {
    const email = auth.email && auth.emailVerified ? normEmail(auth.email) : null;
    await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: { token: dto.token, firebaseUid: auth.uid, email, platform: dto.platform },
      update: { firebaseUid: auth.uid, email, platform: dto.platform },
    });
    return { ok: true };
  }

  async remove(auth: Auth, token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { token, firebaseUid: auth.uid } });
    return { ok: true };
  }

  /** Aviso a la comunidad del club: jugadores, socios, usuarios con membresía activa y tutores. */
  async broadcastToClub(companyId: string, clubId: string, dto: BroadcastDto, senderUid: string) {
    const club = await this.prisma.club.findFirst({ where: { id: clubId, companyId }, select: { id: true, name: true } });
    if (!club) throw new NotFoundException('Club not found');

    const [players, members, memberships] = await Promise.all([
      this.prisma.player.findMany({ where: { companyId, clubId }, select: { authUid: true, extra: true } }),
      this.prisma.member.findMany({ where: { companyId, clubId, authUid: { not: null } }, select: { authUid: true } }),
      this.prisma.clubMembership.findMany({
        where: { companyId, clubId, status: 'ACTIVA' },
        select: { user: { select: { firebaseUid: true } } },
      }),
    ]);

    const uids = new Set<string>();
    players.forEach((p) => p.authUid && uids.add(p.authUid));
    members.forEach((m) => m.authUid && uids.add(m.authUid));
    memberships.forEach((m) => uids.add(m.user.firebaseUid));
    const guardianEmails = new Set<string>();
    for (const p of players) {
      const g = (p.extra as Record<string, unknown> | null)?.guardianEmail;
      if (typeof g === 'string' && g.trim()) guardianEmails.add(normEmail(g));
    }

    const devices = await this.prisma.pushDevice.findMany({
      where: { OR: [{ firebaseUid: { in: [...uids] } }, { email: { in: [...guardianEmails] } }] },
      select: { token: true, firebaseUid: true, email: true },
    });
    const tokens = audienceTokens(devices, uids, guardianEmails, senderUid);
    if (tokens.length === 0) return { devices: 0, sent: 0, failed: 0 };

    const link = dto.url ?? '/dashboard';
    let sent = 0;
    let failed = 0;
    const dead: string[] = [];
    for (const batch of chunk(tokens)) {
      const res = await getMessaging().sendEachForMulticast({
        tokens: batch,
        // Solo datos: el service worker de la app arma y muestra la notificación.
        data: { title: dto.title.slice(0, 80), body: dto.body.slice(0, 300), url: link, tag: `club-${clubId}`, club: club.name },
        webpush: { headers: { Urgency: 'high', TTL: String(60 * 60 * 24) } },
      });
      sent += res.successCount;
      failed += res.failureCount;
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(batch[i]);
      });
    }
    if (dead.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
    this.logger.log(`Push club=${clubId} devices=${tokens.length} sent=${sent} failed=${failed} removed=${dead.length}`);
    return { devices: tokens.length, sent, failed };
  }

  /** Aviso a usuarios puntuales (por ejemplo, la dirección del club). */
  async notifyUsers(uids: string[], msg: { title: string; body: string; url: string; tag: string }) {
    const unique = [...new Set(uids.filter(Boolean))];
    if (unique.length === 0) return { devices: 0, sent: 0, failed: 0 };
    const devices = await this.prisma.pushDevice.findMany({ where: { firebaseUid: { in: unique } }, select: { token: true } });
    const tokens: string[] = [...new Set(devices.map((d) => String(d.token)))];
    if (tokens.length === 0) return { devices: 0, sent: 0, failed: 0 };
    let sent = 0;
    let failed = 0;
    const dead: string[] = [];
    for (const batch of chunk(tokens)) {
      const res = await getMessaging().sendEachForMulticast({
        tokens: batch,
        data: { title: msg.title.slice(0, 80), body: msg.body.slice(0, 300), url: msg.url, tag: msg.tag },
        webpush: { headers: { Urgency: 'high', TTL: String(60 * 60 * 12) } },
      });
      sent += res.successCount;
      failed += res.failureCount;
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(batch[i]);
      });
    }
    if (dead.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
    return { devices: tokens.length, sent, failed };
  }
}
