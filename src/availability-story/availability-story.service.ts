import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';

import { ActivitiesService } from '../activities/activities.service';
import { computeTimes, nowMinuteIn, todayIn } from '../bookings/booking-time';
import { ensureOccurrences } from '../bookings/fixed-turns';
import { displayWhatsapp } from '../clubs/whatsapp';
import { InstagramService } from '../instagram/instagram.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { clubEntitlements } from '../subscriptions/plan-entitlements';
import { activityCaption, activityStoryGroups, priceLabel, type ActivitySource, type Slot } from './activity-story';
import { renderActivityStoryJpeg, renderStoryJpeg } from './story-render';
import { dayTitle, freeRanges, hasFreeTime, storyCaption, storyDates, trimStory, type StoryData, type StoryDay } from './story-rules';

const ACTIVE: BookingStatus[] = ['REQUESTED', 'PENDING_PAYMENT', 'CONFIRMED'];
const ADMIN_ROLES = ['admin', 'club_admin', 'manager'];
const DEFAULT_PUBLIC_API_URL = 'https://nova-app-backend.onrender.com';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Clubes por corrida del cron (cada uno arma una imagen y puede publicar). */
const MAX_PER_RUN = 60;

const publicApiUrl = () => (process.env.PUBLIC_API_URL || DEFAULT_PUBLIC_API_URL).replace(/\/$/, '');

/** Firma del link público de la imagen (Instagram la descarga desde ahí). */
export function storySignature(clubId: string, date: string) {
  const key = process.env.PAYMENT_TOKENS_KEY || process.env.CRON_SECRET || '';
  if (!key) return '';
  return createHmac('sha256', key).update(`story:${clubId}:${date}`).digest('hex').slice(0, 32);
}

export function validStorySignature(clubId: string, date: string, sig: string) {
  const expected = storySignature(clubId, date);
  if (!expected || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pie de las imágenes: el WhatsApp del club; si no hay, el teléfono. */
export function defaultContact(club: { whatsapp?: string | null; phone?: string | null }) {
  const wa = displayWhatsapp(club.whatsapp);
  if (wa) return `WhatsApp ${wa}`;
  return club.phone ? `Tel. ${club.phone}` : null;
}

export type ActivityStoryInput = {
  activityId: string;
  groups?: string[];
  title?: string;
  highlight?: string | null;
  showPrice?: boolean;
  contact?: string | null;
};

export type StorySettingsInput = { whatsapp?: boolean; instagram?: boolean; facilityIds?: string[]; contact?: string | null };

@Injectable()
export class AvailabilityStoryService {
  private readonly logger = new Logger(AvailabilityStoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instagram: InstagramService,
    private readonly push: PushService,
    private readonly activities: ActivitiesService,
  ) {}

  /** Imágenes armadas a pedido para que Instagram las descargue (duran 30 minutos). */
  private readonly temp = new Map<string, { buf: Buffer; expires: number }>();

  private async club(clubId: string, companyId?: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, ...(companyId ? { companyId } : {}) },
      select: {
        id: true,
        companyId: true,
        name: true,
        logoUrl: true,
        coverUrl: true,
        phone: true,
        whatsapp: true,
        timezone: true,
        openMinute: true,
        closeMinute: true,
        availabilityStory: true,
        instagramAccount: { select: { username: true } },
        facilities: { select: { id: true, name: true, bookable: true, photoUrl: true }, orderBy: { name: 'asc' } },
      },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    return club;
  }

  /** Canchas que entran en el estado: las elegidas, o las que se alquilan, o todas. */
  private pickFacilities(club: Awaited<ReturnType<AvailabilityStoryService['club']>>) {
    const chosen = club.availabilityStory?.facilityIds ?? [];
    if (chosen.length) return club.facilities.filter((f) => chosen.includes(f.id));
    const bookable = club.facilities.filter((f) => f.bookable);
    return bookable.length ? bookable : club.facilities;
  }

  /** Turnos libres de hoy y mañana por cancha (rangos de al menos 1 hora). */
  async days(clubId: string, now = new Date()): Promise<StoryDay[]> {
    const club = await this.club(clubId);
    const facilities = this.pickFacilities(club);
    const dates = storyDates(club.timezone, now);
    await ensureOccurrences(this.prisma, clubId, dates[0], dates[dates.length - 1]);
    const bookings = facilities.length
      ? await this.prisma.booking.findMany({
          where: { clubId, facilityId: { in: facilities.map((f) => f.id) }, date: { in: dates }, status: { in: ACTIVE } },
          select: { facilityId: true, date: true, startMinute: true, durationMinutes: true },
        })
      : [];
    const today = todayIn(club.timezone, now);
    return trimStory(
      dates.map((date, index) => ({
        date,
        title: dayTitle(date, index),
        facilities: facilities.map((f) => {
          const taken = bookings
            .filter((b) => b.facilityId === f.id && b.date === date)
            .map((b) => [b.startMinute, b.startMinute + b.durationMinutes] as [number, number]);
          const cells = computeTimes({
            open: club.openMinute,
            close: club.closeMinute,
            duration: 30,
            taken,
            nowMinute: date === today ? nowMinuteIn(club.timezone, now) : null,
          });
          return { name: f.name, ranges: freeRanges(cells) };
        }),
      })),
    );
  }

  /** Imagen como data URI (logo y portada se incrustan; si no se pueden bajar, se omiten). */
  private async embed(url?: string | null) {
    if (!url || !/^https:\/\//i.test(url)) return null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      // resvg dibuja PNG, JPEG y GIF; otros formatos (webp) se dejan afuera.
      if (!/^image\/(png|jpe?g|gif)$/.test(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }

  async storyData(clubId: string, now = new Date()): Promise<StoryData & { date: string }> {
    const club = await this.club(clubId);
    const days = await this.days(clubId, now);
    const cover = club.coverUrl || this.pickFacilities(club).find((f) => f.photoUrl)?.photoUrl;
    const [logo, coverData] = await Promise.all([this.embed(club.logoUrl), this.embed(cover)]);
    return {
      date: days[0]?.date ?? todayIn(club.timezone, now),
      clubName: club.name,
      logo,
      cover: coverData,
      contact: club.availabilityStory?.contact || defaultContact(club),
      days,
    };
  }

  // ─── Consola ──────────────────────────────────────────────────────────────

  async settings(companyId: string, clubId: string) {
    const club = await this.club(clubId, companyId);
    const days = await this.days(clubId);
    const s = club.availabilityStory;
    return {
      whatsapp: s?.whatsapp ?? false,
      instagram: s?.instagram ?? false,
      facilityIds: s?.facilityIds ?? [],
      contact: s?.contact ?? '',
      defaultContact: defaultContact(club) ?? '',
      lastRunDate: s?.lastRunDate ?? null,
      lastInstagramAt: s?.lastInstagramAt ?? null,
      lastError: s?.lastError ?? null,
      instagramConnected: Boolean(club.instagramAccount),
      instagramUsername: club.instagramAccount?.username ?? null,
      facilities: club.facilities.map((f) => ({ id: f.id, name: f.name, bookable: f.bookable })),
      days,
      caption: storyCaption({ clubName: club.name, days, contact: s?.contact || defaultContact(club) }),
    };
  }

  async updateSettings(companyId: string, clubId: string, input: StorySettingsInput) {
    const club = await this.club(clubId, companyId);
    if (input.instagram && !club.instagramAccount)
      throw new ConflictException('Primero conectá el Instagram del club en Integraciones.');
    if (input.instagram) {
      const ent = await clubEntitlements(this.prisma, clubId);
      if (!ent.integrations) throw new ConflictException('La historia automática de Instagram es parte del pack de Integraciones.');
    }
    const facilityIds = input.facilityIds?.filter((id) => club.facilities.some((f) => f.id === id));
    const contact = input.contact === undefined ? undefined : input.contact?.trim().slice(0, 60) || null;
    const data = {
      ...(input.whatsapp === undefined ? {} : { whatsapp: input.whatsapp }),
      ...(input.instagram === undefined ? {} : { instagram: input.instagram }),
      ...(facilityIds === undefined ? {} : { facilityIds }),
      ...(contact === undefined ? {} : { contact }),
    };
    await this.prisma.clubAvailabilityStory.upsert({
      where: { clubId },
      create: { companyId, clubId, ...data },
      update: data,
    });
    return this.settings(companyId, clubId);
  }

  /** Imagen del día para compartir desde el celular. */
  async image(companyId: string, clubId: string) {
    await this.club(clubId, companyId);
    const data = await this.storyData(clubId);
    const jpeg = renderStoryJpeg(data);
    return {
      date: data.date,
      hasFreeTime: hasFreeTime(data.days),
      caption: storyCaption(data),
      dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    };
  }

  /** Imagen pública firmada (la descarga Instagram para publicar la historia). */
  async publicImage(clubId: string, date: string, sig: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validStorySignature(clubId, date, sig)) throw new NotFoundException();
    const data = await this.storyData(clubId);
    if (data.date !== date) throw new NotFoundException();
    return renderStoryJpeg(data);
  }

  async publishInstagram(companyId: string, clubId: string) {
    const club = await this.club(clubId, companyId);
    if (!club.instagramAccount) throw new ConflictException('Primero conectá el Instagram del club en Integraciones.');
    const date = todayIn(club.timezone);
    const sig = storySignature(clubId, date);
    if (!sig) throw new BadRequestException('Falta configurar la clave del servidor para publicar.');
    const url = `${publicApiUrl()}/public/availability-story/${encodeURIComponent(clubId)}/${date}.jpg?sig=${sig}`;
    const { mediaId } = await this.instagram.publishStory(companyId, clubId, url);
    await this.prisma.clubAvailabilityStory.upsert({
      where: { clubId },
      create: { companyId, clubId, lastInstagramAt: new Date(), lastError: null },
      update: { lastInstagramAt: new Date(), lastError: null },
    });
    return { mediaId };
  }

  // ─── Corrida diaria ───────────────────────────────────────────────────────

  /** La dispara un cron externo a la mañana: historia de Instagram y aviso para el estado de WhatsApp. */
  async runDaily(now = new Date()) {
    const rows = await this.prisma.clubAvailabilityStory.findMany({
      where: { OR: [{ whatsapp: true }, { instagram: true }] },
      include: { club: { select: { timezone: true, name: true } } },
      take: 500,
    });
    let instagram = 0;
    let notified = 0;
    let skipped = 0;
    let done = 0;
    for (const row of rows) {
      if (done >= MAX_PER_RUN) break;
      const today = todayIn(row.club.timezone, now);
      if (row.lastRunDate === today) continue;
      done++;
      let error: string | null = null;
      try {
        const days = await this.days(row.clubId, now);
        if (!hasFreeTime(days)) {
          skipped++;
        } else {
          if (row.instagram) {
            try {
              await this.publishInstagram(row.companyId, row.clubId);
              instagram++;
            } catch (e) {
              error = `Instagram: ${e instanceof Error ? e.message : 'error'}`;
            }
          }
          if (row.whatsapp) {
            notified += await this.notifyAdmins(row.companyId, row.clubId);
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'error';
      }
      await this.prisma.clubAvailabilityStory.update({
        where: { id: row.id },
        data: { lastRunDate: today, lastError: error },
      });
      if (error) this.logger.warn(`Estado turnos libres club=${row.clubId}: ${error}`);
    }
    return { clubs: done, instagram, notified, skipped };
  }

  private async notifyAdmins(companyId: string, clubId: string) {
    const admins = await this.prisma.user.findMany({
      where: { companyId, role: { in: ADMIN_ROLES } },
      select: { firebaseUid: true },
    });
    const res = await this.push.notifyUsers(
      admins.map((a) => a.firebaseUid),
      {
        title: 'Turnos libres de hoy',
        body: 'Tu estado de WhatsApp está listo: tocá para compartirlo.',
        url: `/dashboard/clubs/${clubId}/facilities/rentals?estado=1`,
        tag: `estado-${clubId}`,
      },
    );
    return res.sent;
  }

  // ─── Historias de actividades e inscripciones ─────────────────────────────

  /** Disciplinas (con sus categorías) y actividades sueltas del club, listas para elegir. */
  async activitySources(companyId: string, clubId: string): Promise<(ActivitySource & { kind: 'discipline' | 'activity'; audience: string | null; showPrice: boolean })[]> {
    const { disciplines, activities } = await this.activities.list(companyId, clubId);
    return [
      ...disciplines.map((d) => ({
        id: d.id,
        kind: 'discipline' as const,
        name: d.name,
        emoji: d.emoji,
        audience: d.audience,
        coaches: d.coaches,
        groups: d.groups,
        price: d.settings.price,
        priceUnit: d.settings.priceUnit,
        showPrice: d.settings.showPrice,
      })),
      ...activities.map((a) => ({
        id: a.id,
        kind: 'activity' as const,
        name: a.name,
        audience: a.audience,
        coaches: a.coaches,
        schedule: (Array.isArray(a.schedule) ? a.schedule : []) as Slot[],
        price: a.price,
        priceUnit: a.priceUnit,
        showPrice: a.showPrice,
      })),
    ];
  }

  private async activityStory(companyId: string, clubId: string, input: ActivityStoryInput) {
    const club = await this.club(clubId, companyId);
    const source = (await this.activitySources(companyId, clubId)).find((s) => s.id === input.activityId);
    if (!source) throw new NotFoundException('Actividad no encontrada');
    const groups = activityStoryGroups(source, input.groups);
    const contact = input.contact?.trim() || club.availabilityStory?.contact || defaultContact(club);
    const [logo, cover] = await Promise.all([this.embed(club.logoUrl), this.embed(club.coverUrl)]);
    const data = {
      clubName: club.name,
      logo,
      cover,
      contact,
      title: input.title?.trim().slice(0, 60) || source.name,
      audience: source.audience,
      highlight: input.highlight === undefined ? 'Inscripciones abiertas' : input.highlight?.trim().slice(0, 40) || null,
      price: input.showPrice ? priceLabel(source.price, source.priceUnit) : null,
      groups,
    };
    return { data, jpeg: renderActivityStoryJpeg(data) };
  }

  async activityImage(companyId: string, clubId: string, input: ActivityStoryInput) {
    const { data, jpeg } = await this.activityStory(companyId, clubId, input);
    return { caption: activityCaption(data), dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
  }

  async publishActivityInstagram(companyId: string, clubId: string, input: ActivityStoryInput) {
    const { jpeg } = await this.activityStory(companyId, clubId, input);
    const id = this.keep(jpeg);
    const url = `${publicApiUrl()}/public/availability-story/tmp/${id}.jpg`;
    return this.instagram.publishStory(companyId, clubId, url);
  }

  private keep(buf: Buffer) {
    const now = Date.now();
    for (const [k, v] of this.temp) if (v.expires < now) this.temp.delete(k);
    const id = randomBytes(18).toString('base64url');
    this.temp.set(id, { buf, expires: now + 30 * 60_000 });
    return id;
  }

  tempImage(id: string) {
    const hit = this.temp.get(id);
    if (!hit || hit.expires < Date.now()) throw new NotFoundException();
    return hit.buf;
  }
}
