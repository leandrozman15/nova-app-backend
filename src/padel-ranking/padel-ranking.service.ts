import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { dniHash } from '../common/pii-crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  FINALS_WINDOW_DAYS,
  applyLoss,
  canLower,
  categoryOfElo,
  checkPlayers,
  eloDelta,
  isBetter,
  isCategory,
  oneUp,
  shouldPromote,
  startingElo,
} from './padel-categories';
import type { PadelCategory, PadelRules } from './padel-categories';

const PROFILE_SELECT = {
  id: true,
  displayName: true,
  category: true,
  floorCategory: true,
  elo: true,
  isProvisional: true,
  matchesPlayed: true,
  matchesWon: true,
  tournamentsWon: true,
  lastCategoryChangeAt: true,
  verifiedByClubId: true,
} as const;

const asCategory = (code: string): PadelCategory =>
  isCategory(code) ? code : '8VA';

@Injectable()
export class PadelRankingService {
  private readonly log = new Logger(PadelRankingService.name);
  constructor(private readonly prisma: PrismaService) {}

  // ─── Perfil propio ────────────────────────────────────────────────────────

  async myProfile(firebaseUid: string) {
    const user = await this.user(firebaseUid);
    return this.prisma.padelProfile.findUnique({
      where: { userId: user.id },
      select: {
        ...PROFILE_SELECT,
        changes: { orderBy: { createdAt: 'desc' }, take: 20 },
        results: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }

  /** Mis inscripciones a torneos (de cualquier club), para ver estado e historial sin pertenecer a ninguno. */
  async myTournaments(firebaseUid: string) {
    const user = await this.user(firebaseUid);
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        teamName: true,
        createdAt: true,
        tournament: {
          select: {
            id: true,
            name: true,
            sport: true,
            category: true,
            status: true,
            startDate: true,
            endDate: true,
            club: { select: { id: true, name: true } },
          },
        },
      },
    });
    return entries.map((e) => ({
      id: e.id,
      status: e.status,
      teamName: e.teamName,
      createdAt: e.createdAt,
      tournament: e.tournament,
    }));
  }

  /**
   * Declarar la categoría por primera vez. El DNI es único en toda la red: si ya tiene perfil
   * se devuelve ese (no se puede crear otro para jugar en una categoría más baja).
   */
  async declare(firebaseUid: string, dni: string, category: string) {
    const user = await this.user(firebaseUid);
    const hash = this.hash(dni);
    const mine = await this.prisma.padelProfile.findUnique({ where: { userId: user.id } });
    if (mine && mine.dniHash !== hash)
      throw new ConflictException('Tu perfil ya está asociado a otro DNI.');
    if (mine) return this.pick(mine, true);
    const existing = await this.prisma.padelProfile.findUnique({ where: { dniHash: hash } });
    if (existing) {
      if (existing.userId)
        throw new ConflictException('Ese DNI ya está asociado a otra cuenta. Hablá con el club.');
      // Lo cargó un club o un compañero: se vincula con su cuenta y conserva SU categoría.
      const linked = await this.prisma.padelProfile.update({
        where: { id: existing.id },
        data: { userId: user.id },
      });
      return this.pick(linked, true);
    }
    const cat = asCategory(category);
    const created = await this.prisma.padelProfile.create({
      data: {
        dniHash: hash,
        userId: user.id,
        displayName: user.name?.trim() || 'Jugador/a',
        category: cat,
        floorCategory: cat,
        elo: startingElo(cat),
        isProvisional: true,
        changes: { create: { toCategory: cat, reason: 'declared' } },
      },
    });
    return this.pick(created, false);
  }

  // ─── Dirección del club ───────────────────────────────────────────────────

  /** Suma (o refuerza) el motivo por el que un perfil aparece en el padrón de un club. */
  private async linkToClub(companyId: string, clubId: string, profileId: string, reason: 'socio' | 'torneo') {
    const existing = await this.prisma.clubPadelMember.findUnique({
      where: { clubId_profileId: { clubId, profileId } },
      select: { id: true, reasons: true },
    });
    if (!existing) {
      await this.prisma.clubPadelMember.create({ data: { companyId, clubId, profileId, reasons: [reason] } });
      return;
    }
    if (existing.reasons.includes(reason)) return;
    await this.prisma.clubPadelMember.update({
      where: { id: existing.id },
      data: { reasons: [...existing.reasons, reason] },
    });
  }

  /** El club da de alta (o encuentra) a un jugador por DNI, con la categoría que verificó en cancha. Queda en su padrón. */
  async clubUpsert(companyId: string, clubId: string, byUid: string | undefined, input: { dni: string; name: string; category: string }) {
    const hash = this.hash(input.dni);
    const existing = await this.prisma.padelProfile.findUnique({ where: { dniHash: hash }, select: PROFILE_SELECT });
    if (existing) {
      await this.linkToClub(companyId, clubId, existing.id, 'socio');
      return { ...existing, existing: true };
    }
    const cat = asCategory(input.category);
    const created = await this.prisma.padelProfile.create({
      data: {
        dniHash: hash,
        displayName: input.name,
        category: cat,
        floorCategory: cat,
        elo: startingElo(cat),
        isProvisional: true,
        verifiedByClubId: clubId,
        changes: { create: { toCategory: cat, reason: 'declared', clubId, byUid: byUid ?? null } },
      },
      select: PROFILE_SELECT,
    });
    await this.linkToClub(companyId, clubId, created.id, 'socio');
    return { ...created, existing: false };
  }

  /** Padrón del club: socios cargados por la dirección y quienes se anotaron a sus torneos. */
  async roster(clubId: string, search?: string, limit = 100) {
    const q = search?.trim();
    const members = await this.prisma.clubPadelMember.findMany({
      where: {
        clubId,
        ...(q ? { profile: { displayName: { contains: q, mode: 'insensitive' } } } : {}),
      },
      orderBy: [{ profile: { elo: 'desc' } }],
      take: Math.min(Math.max(limit, 1), 200),
      select: { reasons: true, profile: { select: PROFILE_SELECT } },
    });
    return members.map((m) => ({ ...m.profile, reasons: m.reasons }));
  }

  /** Búsqueda en toda la red (solo para no duplicar un perfil al cargar un jugador nuevo). */
  async search(search?: string, limit = 50) {
    const q = search?.trim();
    return this.prisma.padelProfile.findMany({
      where: q ? { displayName: { contains: q, mode: 'insensitive' } } : {},
      orderBy: [{ elo: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
      select: PROFILE_SELECT,
    });
  }

  async detail(id: string) {
    const profile = await this.prisma.padelProfile.findUnique({
      where: { id },
      select: {
        ...PROFILE_SELECT,
        changes: { orderBy: { createdAt: 'desc' }, take: 20 },
        results: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!profile) throw new NotFoundException('Jugador no encontrado');
    return profile;
  }

  /** "Recategorizar atleta": actualiza el piso permanente en toda la red, con auditoría. */
  async recategorize(
    clubId: string,
    byUid: string | undefined,
    id: string,
    input: { category: string; reason: string; note?: string },
  ) {
    const profile = await this.prisma.padelProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Jugador no encontrado');
    const to = asCategory(input.category);
    if (to === profile.category) throw new BadRequestException('Ya está en esa categoría.');
    const lowering = !isBetter(to, profile.category);
    if (lowering) {
      if (!input.note?.trim())
        throw new BadRequestException('Para bajar de categoría hay que dejar el motivo por escrito.');
      if (
        !canLower({
          isProvisional: profile.isProvisional,
          lastChangeAt: profile.lastCategoryChangeAt,
          reason: input.reason,
        })
      )
        throw new ConflictException(
          'Cambió de categoría hace menos de 6 meses: solo se puede bajar por lesión o inactividad.',
        );
    }
    const elo = lowering ? startingElo(to) : Math.max(profile.elo, startingElo(to));
    await this.prisma.padelProfile.update({
      where: { id },
      data: {
        category: to,
        floorCategory: to,
        elo,
        isProvisional: false,
        verifiedByClubId: clubId,
        lastCategoryChangeAt: new Date(),
        changes: {
          create: {
            fromCategory: profile.category,
            toCategory: to,
            reason: lowering ? 'lowered' : 'recategorized',
            clubId,
            byUid: byUid ?? null,
            note: [input.reason, input.note?.trim()].filter(Boolean).join(' · '),
          },
        },
      },
    });
    return this.detail(id);
  }

  // ─── Inscripción ──────────────────────────────────────────────────────────

  /** Controla la categoría del que se inscribe (y de su compañero/a) contra las reglas del torneo. Los suma al padrón del club. */
  async validateEntry(userId: string, rules: PadelRules, partnerDni?: string | null, club?: { companyId: string; clubId: string }) {
    if (!rules.mode) return { partnerDniHash: null as string | null };
    const me = await this.prisma.padelProfile.findUnique({ where: { userId } });
    if (!me)
      throw new ConflictException({
        code: 'PADEL_PROFILE_REQUIRED',
        message: 'Declará tu categoría de pádel antes de inscribirte a este torneo.',
      });
    const players = [{ name: me.displayName, category: me.category }];
    let partnerHash: string | null = null;
    let partnerId: string | null = null;
    if (partnerDni) {
      partnerHash = this.hash(partnerDni);
      if (partnerHash === me.dniHash)
        throw new BadRequestException('El DNI de tu compañero/a no puede ser el tuyo.');
      const partner = await this.prisma.padelProfile.findUnique({ where: { dniHash: partnerHash } });
      if (!partner)
        throw new ConflictException({
          code: 'PADEL_PARTNER_REQUIRED',
          message: 'Tu compañero/a todavía no tiene categoría en Fluxion. Que la declare desde la app (o pedile al club que la cargue).',
        });
      players.push({ name: partner.displayName, category: partner.category });
      partnerId = partner.id;
    } else if (rules.mode === 'suma') {
      throw new BadRequestException('Este torneo es por suma: cargá el DNI de tu compañero/a.');
    }
    const verdict = checkPlayers(rules, players);
    if (!verdict.ok)
      throw new ConflictException({ code: 'PADEL_CATEGORY_BLOCKED', message: verdict.reasons.join('. ') + '.' });
    if (club) {
      await this.linkToClub(club.companyId, club.clubId, me.id, 'torneo');
      if (partnerId) await this.linkToClub(club.companyId, club.clubId, partnerId, 'torneo');
    }
    return { partnerDniHash: partnerHash };
  }

  // ─── Resultados ───────────────────────────────────────────────────────────

  /**
   * Un partido de pádel quedó resuelto: actualiza ELO, estadísticas y ascensos automáticos.
   * Nunca interrumpe la carga del resultado: si algo falla, se registra y se sigue.
   */
  async onMatchWon(input: { tournamentId: string; winnerTeamId: string; loserTeamId: string; isFinal: boolean }) {
    try {
      const tournament = await this.prisma.clubTournament.findUnique({
        where: { id: input.tournamentId },
        select: { sport: true },
      });
      if (tournament?.sport !== 'padel') return;
      const [winners, losers] = await Promise.all([
        this.profilesOfTeam(input.winnerTeamId),
        this.profilesOfTeam(input.loserTeamId),
      ]);
      if (!winners.length || !losers.length) return;
      const avg = (list: { elo: number }[]) => list.reduce((n, p) => n + p.elo, 0) / list.length;
      const delta = eloDelta(avg(winners), avg(losers));
      for (const p of winners) await this.win(p.id, delta);
      for (const p of losers) await this.lose(p.id, delta);
      if (input.isFinal) {
        const teamsCount = await this.prisma.tournamentTeam.count({ where: { tournamentId: input.tournamentId } });
        for (const p of winners) await this.final(p.id, input.tournamentId, 'champion', teamsCount);
        for (const p of losers) await this.final(p.id, input.tournamentId, 'finalist', teamsCount);
      }
    } catch (error) {
      this.log.error(`No se pudo actualizar el ranking de pádel: ${(error as Error).message}`);
    }
  }

  private async win(id: string, delta: number) {
    const p = await this.prisma.padelProfile.findUniqueOrThrow({ where: { id } });
    const elo = p.elo + delta;
    const played = p.matchesPlayed + 1;
    const reached = categoryOfElo(elo);
    const climb = isBetter(reached, p.category);
    await this.prisma.padelProfile.update({
      where: { id },
      data: {
        elo,
        matchesPlayed: played,
        matchesWon: { increment: 1 },
        isProvisional: p.isProvisional && played < 3,
        ...(climb && {
          category: reached,
          floorCategory: reached,
          lastCategoryChangeAt: new Date(),
          changes: { create: { fromCategory: p.category, toCategory: reached, reason: 'elo' } },
        }),
      },
    });
  }

  private async lose(id: string, delta: number) {
    const p = await this.prisma.padelProfile.findUniqueOrThrow({ where: { id } });
    const played = p.matchesPlayed + 1;
    await this.prisma.padelProfile.update({
      where: { id },
      data: {
        elo: applyLoss(p.elo, delta, asCategory(p.floorCategory)),
        matchesPlayed: played,
        isProvisional: p.isProvisional && played < 3,
      },
    });
  }

  private async final(id: string, tournamentId: string, kind: 'champion' | 'finalist', teamsCount: number) {
    try {
      await this.prisma.padelResult.create({ data: { profileId: id, tournamentId, kind, teamsCount } });
    } catch {
      return; // ya contada (se corrigió el resultado de la final)
    }
    if (kind === 'champion') await this.prisma.padelProfile.update({ where: { id }, data: { tournamentsWon: { increment: 1 } } });
    const since = new Date(Date.now() - FINALS_WINDOW_DAYS * 86_400_000);
    const finalsInWindow = await this.prisma.padelResult.count({ where: { profileId: id, createdAt: { gte: since } } });
    const why = shouldPromote({ kind, teamsCount, finalsInWindow });
    if (!why) return;
    const p = await this.prisma.padelProfile.findUniqueOrThrow({ where: { id } });
    const to = oneUp(asCategory(p.category));
    if (to === p.category) return;
    await this.prisma.padelProfile.update({
      where: { id },
      data: {
        category: to,
        floorCategory: to,
        elo: Math.max(p.elo, startingElo(to)),
        lastCategoryChangeAt: new Date(),
        changes: {
          create: {
            fromCategory: p.category,
            toCategory: to,
            reason: 'promotion',
            note: why === 'champion' ? `Campeón con ${teamsCount} parejas` : 'Dos finales en 60 días',
          },
        },
      },
    });
  }

  /** Perfiles de los integrantes de una pareja: por la inscripción de la app o por la ficha del padrón. */
  private async profilesOfTeam(teamId: string) {
    const team = await this.prisma.tournamentTeam.findUnique({
      where: { id: teamId },
      select: { entryId: true, players: true },
    });
    if (!team) return [];
    const hashes = new Set<string>();
    const userIds = new Set<string>();
    if (team.entryId) {
      const entry = await this.prisma.tournamentEntry.findUnique({
        where: { id: team.entryId },
        select: { userId: true, partnerDniHash: true },
      });
      if (entry) {
        userIds.add(entry.userId);
        if (entry.partnerDniHash) hashes.add(entry.partnerDniHash);
      }
    }
    const playerIds = (Array.isArray(team.players) ? (team.players as { playerId?: string | null }[]) : [])
      .map((p) => p.playerId)
      .filter((v): v is string => Boolean(v));
    if (playerIds.length) {
      const rows = await this.prisma.player.findMany({ where: { id: { in: playerIds } }, select: { dniHash: true } });
      for (const r of rows) if (r.dniHash) hashes.add(r.dniHash);
    }
    if (!hashes.size && !userIds.size) return [];
    return this.prisma.padelProfile.findMany({
      where: { OR: [{ userId: { in: [...userIds] } }, { dniHash: { in: [...hashes] } }] },
      select: { id: true, elo: true },
    });
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private hash(dni: string) {
    const h = dniHash(dni);
    if (!h) throw new BadRequestException('DNI inválido');
    return h;
  }

  private async user(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, name: true },
    });
    if (!user) throw new NotFoundException('Perfil no registrado');
    return user;
  }

  private pick(p: Record<string, any>, existing: boolean) {
    const out: Record<string, any> = { existing };
    for (const k of Object.keys(PROFILE_SELECT)) out[k] = p[k];
    return out;
  }
}

