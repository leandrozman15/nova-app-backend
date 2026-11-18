import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { activeAthletes, clubEntitlements } from '../subscriptions/plan-entitlements';
import { seatsProblem } from '../subscriptions/plan-rules';
import { Prisma } from '@prisma/client';

import { dniHash } from '../common/pii-crypto';
import { todayIn } from '../bookings/booking-time';
import { AuditService, type AuditActor } from '../platform/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { FirestoreMigrationService } from '../roster/firestore-migration.service';
import type { ImportRowDto } from './player-import.dto';
import {
  fold,
  validateRows,
  type Discipline,
  type Division,
  type RowResult,
} from './player-import.rules';
import { randomUUID } from 'node:crypto';

import { placementOf, planMissing, sportFor, teamRama, withPlanned, type ExistingTeam } from './player-import.plan';

/**
 * Implantación automática de jugadores de un club desde la plantilla Excel:
 * crea la ficha en la base (padrón) y en la consola del club (Firestore).
 * Las cuentas se vinculan después, cuando cada jugador entra a la app con su email.
 */
@Injectable()
export class PlayerImportService {
  private readonly logger = new Logger(PlayerImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: FirestoreMigrationService,
    private readonly audit: AuditService,
  ) {}

  /** Lo que la plantilla necesita del club: disciplinas y categorías para las listas. */
  async templateData(clubId: string) {
    const club = await this.requireClub(clubId);
    const { disciplines, divisions } = await this.clubLists(clubId);
    return {
      club: { id: club.id, name: club.name, city: club.city },
      disciplines,
      divisions,
    };
  }

  async run(
    actor: AuditActor,
    clubId: string,
    rows: ImportRowDto[],
    dryRun: boolean,
    autoCreate = true,
  ) {
    const club = await this.requireClub(clubId);
    let { disciplines, divisions } = await this.clubLists(clubId);
    let teams = await this.clubTeams(clubId);
    // Disciplinas, ramas y categorías que la planilla usa y el club todavía no tiene.
    const plan = autoCreate
      ? planMissing(rows, disciplines, divisions, teams)
      : { disciplines: [], divisions: [], teams: [] };
    const hasPlan = plan.disciplines.length > 0 || plan.divisions.length > 0 || plan.teams.length > 0;
    if (hasPlan && dryRun) {
      ({ disciplines, divisions, teams } = withPlanned(disciplines, divisions, teams, plan));
    } else if (hasPlan) {
      await this.createStructure(club, plan, actor);
      ({ disciplines, divisions } = await this.clubLists(clubId));
      teams = await this.clubTeams(clubId);
    }

    // Cada fila va a su rama (la valida el revisor) y a su categoría dentro de la rama.
    const placed = rows.map((row) => {
      const text = String(row.sport ?? '').trim();
      const guess = text ? sportFor(text) : null;
      const sport = text
        ? disciplines.find((d) => fold(d.sportId) === fold(text) || fold(d.name) === fold(text) || d.sportId === guess?.sportId)
        : undefined;
      if (!autoCreate || !sport) return { row, teamName: null as string | null };
      const place = placementOf(row, sport, divisions);
      return { row: { ...row, category: place.divisionName }, teamName: place.teamName };
    });
    const today = todayIn(club.timezone);
    const results = validateRows(placed.map((p) => p.row), { disciplines, divisions, today });
    results.forEach((result, index) => {
      const teamName = placed[index].teamName;
      if (!result.player || !teamName || !result.player.divisionId) return;
      const team = teams.find((t) => t.divisionId === result.player!.divisionId && fold(t.name) === fold(teamName));
      result.player.teamId = team?.id ?? null;
      result.player.teamName = teamName;
    });
    await this.markExisting(club, results);

    const importable = results.filter(
      (result) =>
        result.player &&
        (result.status === 'ok' || result.status === 'warning'),
    );
    // Cupo de atletas del plan: en la revisión se informa, al implantar se corta.
    const ent = await clubEntitlements(this.prisma, club.id);
    const active = ent.limited ? await activeAthletes(this.prisma, club.id) : null;
    const seats = ent.limited ? { limit: ent.athleteLimit, active: active!, adding: importable.length } : null;
    if (!dryRun && seats) {
      const problem = seatsProblem(seats.limit, seats.active, seats.adding);
      if (problem) throw new ForbiddenException(problem);
    }
    let created = 0;
    if (!dryRun && importable.length > 0) {
      created = await this.create(club, importable, actor);
      await this.audit.record(
        actor,
        'players.import',
        { type: 'Club', id: club.id },
        {
          after: {
            club: club.name,
            rows: rows.length,
            created,
            skipped: results.length - created,
          },
        },
      );
    }

    return {
      club: { id: club.id, name: club.name },
      dryRun,
      created,
      // En la revisión: lo que se va a crear. Al implantar: lo que se creó.
      structure: plan,
      seats,
      summary: {
        total: results.length,
        ok: results.filter((result) => result.status === 'ok').length,
        warning: results.filter((result) => result.status === 'warning').length,
        error: results.filter((result) => result.status === 'error').length,
        duplicate: results.filter((result) => result.status === 'duplicate')
          .length,
      },
      results,
    };
  }

  /** DNI que ya está en el club (base o consola) = duplicado; email tomado = se importa sin email. */
  private async markExisting(
    club: { id: string; companyId: string },
    results: RowResult[],
  ) {
    const dnis = results.flatMap((result) =>
      result.player ? [result.player.dni] : [],
    );
    const emails = results.flatMap((result) =>
      result.player?.email ? [result.player.email] : [],
    );
    if (dnis.length === 0) return;

    const [byDni, byEmail] = await Promise.all([
      this.prisma.player.findMany({
        where: {
          companyId: club.companyId,
          dniHash: { in: dnis.flatMap((dni) => dniHash(dni) ?? []) },
        },
        select: { dni: true, firstName: true, lastName: true, clubId: true },
      }),
      emails.length
        ? this.prisma.player.findMany({
            where: { email: { in: emails, mode: 'insensitive' } },
            select: { email: true },
          })
        : Promise.resolve([] as Array<{ email: string | null }>),
    ]);

    const known = new Map(
      byDni.map((player) => [(player.dni ?? '').replace(/\D/g, ''), player]),
    );
    const takenEmails = new Set(
      byEmail.map((player) => (player.email ?? '').toLowerCase()),
    );
    for (const result of results) {
      if (!result.player) continue;
      const existing = known.get(result.player.dni);
      if (existing) {
        result.status = 'duplicate';
        result.errors.push(
          `Ya existe: ${existing.firstName} ${existing.lastName} (DNI ${result.player.dni})${existing.clubId === club.id ? '' : ' en otro club de la misma institución'}.`,
        );
        continue;
      }
      if (result.player.email && takenEmails.has(result.player.email)) {
        result.warnings.push(
          `El email ${result.player.email} ya está en otra ficha: se importa sin email.`,
        );
        result.player.email = null;
        if (result.status === 'ok') result.status = 'warning';
      }
    }
  }

  private async create(
    club: { id: string; name: string; companyId: string },
    rows: RowResult[],
    actor: AuditActor,
  ) {
    const batchId = `import-${Date.now()}`;
    let created = 0;
    for (const result of rows) {
      const player = result.player!;
      try {
        const row = await this.prisma.player.create({
          data: {
            companyId: club.companyId,
            clubId: club.id,
            firstName: player.firstName,
            lastName: player.lastName,
            dni: player.dni,
            email: player.email,
            phone: player.phone,
            address: player.address,
            locality: player.locality,
            province: player.province,
            position: player.position,
            birthDate: new Date(`${player.birthDate}T12:00:00Z`),
            notes: player.notes,
            active: true,
            status: 'active',
            role: 'player',
            sport: player.sport,
            divisionId: player.divisionId,
            branch: player.branch,
            gender: player.gender,
            membershipNumber: player.membershipNumber,
            hasMedicalCert: player.hasMedicalCert,
            hasMinorAuth: player.hasMinorAuth,
            extra: {
              importBatch: batchId,
              importedBy: actor.email ?? actor.uid,
              ...(player.teamId ? { teamId: player.teamId } : {}),
            },
          },
          select: { id: true },
        });
        if (player.teamId && player.divisionId)
          await this.assignToTeam(club, row.id, `${player.firstName} ${player.lastName}`, player.divisionId, player.teamId);
        created += 1;
      } catch (error) {
        result.status = 'error';
        result.errors.push(
          error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
            ? 'Ya existe una ficha con ese DNI o email.'
            : 'No se pudo crear la ficha.',
        );
        this.logger.warn(`Fila ${result.row}: ${String(error)}`);
      }
    }
    return created;
  }

  /** Crea en el club las disciplinas y categorías que faltan (mismo formato que el alta manual). */
  private async createStructure(
    club: { id: string; name: string; companyId: string },
    plan: ReturnType<typeof planMissing>,
    actor: AuditActor,
  ) {
    for (const d of plan.disciplines) {
      await this.prisma.clubDiscipline.upsert({
        where: { clubId_sportId: { clubId: club.id, sportId: d.sportId } },
        update: {},
        create: {
          id: `${club.id}_${d.sportId}`,
          companyId: club.companyId,
          clubId: club.id,
          sportId: d.sportId,
          name: d.name,
          emoji: d.emoji,
          status: 'active',
          extra: { createdBy: 'player-import' },
        },
      });
    }
    for (const d of plan.divisions) {
      await this.prisma.division.create({
        data: {
          companyId: club.companyId,
          clubId: club.id,
          sport: d.sport,
          name: d.name,
          branch: d.branch,
          status: 'active',
          extra: { createdBy: 'player-import' },
        },
      });
    }
    if (plan.teams.length) {
      const divisions = await this.prisma.division.findMany({ where: { clubId: club.id }, select: { id: true, name: true, sport: true } });
      for (const t of plan.teams) {
        const division = divisions.find(
          (d) => fold(d.name) === fold(t.divisionName) && (!d.sport || fold(d.sport) === fold(t.sport)),
        );
        if (!division) continue;
        await this.createTeam(club, division.id, { name: t.name, sport: t.sport, branch: t.branch });
      }
    }
    if (plan.disciplines.length) await this.migration.syncClubSports(club.id);
    await this.audit.record(
      actor,
      'players.import.structure',
      { type: 'Club', id: club.id },
      {
        after: {
          disciplines: plan.disciplines.map((d) => d.name),
          divisions: plan.divisions.map((d) => `${d.sportName}: ${d.name}`),
          teams: plan.teams.map((t) => `${t.divisionName} › ${t.name}`),
        },
      },
    );
  }

  /**
   * Reacomoda lo que una implantación anterior creó como ramas sueltas ("2013", "2014"…):
   * por deporte arma una rama (p. ej. "Fútbol infantil") y pasa cada una a categoría dentro de ella,
   * con sus jugadores, su entrenador y su coordinador. Solo toca ramas creadas por la implantación y sin categorías.
   */
  async restructure(actor: AuditActor, clubId: string, dryRun: boolean, names: Record<string, string> = {}) {
    const club = await this.requireClub(clubId);
    const candidates = await this.prisma.division.findMany({
      where: { clubId, extra: { path: ['createdBy'], equals: 'player-import' } },
      select: { id: true, name: true, sport: true, branch: true, headCoachId: true, coordinatorId: true },
    });
    const withTeams = new Set((await this.clubTeams(clubId)).map((t) => t.divisionId));
    const loose = candidates.filter((d) => !withTeams.has(d.id) && d.sport);
    const disciplines = await this.prisma.clubDiscipline.findMany({ where: { clubId }, select: { sportId: true, name: true } });
    const counts = await this.prisma.player.groupBy({ by: ['divisionId'], where: { clubId, divisionId: { in: loose.map((d) => d.id) } }, _count: { _all: true } });
    const countOf = (id: string) => counts.find((c) => c.divisionId === id)?._count._all ?? 0;

    const groups = new Map<string, typeof loose>();
    for (const d of loose) groups.set(d.sport!, [...(groups.get(d.sport!) ?? []), d]);
    const plan = [...groups.entries()].map(([sport, list]) => {
      const sportName = disciplines.find((x) => x.sportId === sport)?.name ?? sport;
      const branches = new Set<string>(list.map((d) => (d.branch as string | null) ?? 'mixto'));
      const branch = branches.size === 1 ? [...branches][0] : 'mixto';
      const rama = (names[sport] ?? '').trim().slice(0, 60) || `${sportName} ${branch}`;
      return {
        sport, sportName, rama, branch,
        categories: list
          .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
          .map((d) => ({ id: d.id, name: d.name, players: countOf(d.id), headCoachId: d.headCoachId, coordinatorId: d.coordinatorId })),
      };
    });
    const summary = plan.map(({ sport, sportName, rama, categories }) => ({
      sport, sportName, rama, categories: categories.map((c) => ({ name: c.name, players: c.players })),
    }));
    if (dryRun || plan.length === 0) return { dryRun, groups: summary };

    const nameOf = async (uid: string | null) => {
      if (!uid) return '';
      const doc = await this.prisma.storeDocument.findUnique({ where: { path: `users/${uid}` }, select: { data: true } });
      return String(((doc?.data ?? {}) as Record<string, unknown>).name ?? '');
    };
    for (const g of plan) {
      const existing = await this.prisma.division.findFirst({ where: { clubId, sport: g.sport, name: { equals: g.rama, mode: 'insensitive' } }, select: { id: true } });
      const ramaId = existing?.id ?? (await this.prisma.division.create({
        data: { companyId: club.companyId, clubId, sport: g.sport, name: g.rama, branch: g.branch, status: 'active', extra: { createdBy: 'player-import' } },
        select: { id: true },
      })).id;
      for (const c of g.categories) {
        const teamId = await this.createTeam(club, ramaId, {
          name: c.name, sport: g.sport, branch: g.branch,
          extra: {
            coachId: c.headCoachId ?? '', coachName: await nameOf(c.headCoachId),
            coordinatorId: c.coordinatorId ?? '', coordinatorName: await nameOf(c.coordinatorId),
          },
        });
        const players = await this.prisma.player.findMany({ where: { clubId, divisionId: c.id }, select: { id: true, firstName: true, lastName: true, extra: true } });
        for (const pl of players) {
          await this.prisma.player.update({
            where: { id: pl.id },
            data: { divisionId: ramaId, extra: { ...((pl.extra ?? {}) as Record<string, unknown>), teamId } },
          });
          await this.assignToTeam(club, pl.id, `${pl.firstName} ${pl.lastName}`, ramaId, teamId);
        }
        await this.prisma.division.delete({ where: { id: c.id } });
      }
    }
    await this.audit.record(actor, 'players.import.restructure', { type: 'Club', id: club.id }, { after: { groups: summary } });
    return { dryRun, groups: summary };
  }

  /** Categoría (plantel) dentro de una rama, con el mismo formato que el formulario de la app. */
  async createTeam(
    club: { id: string; companyId: string },
    divisionId: string,
    t: { name: string; sport: string; branch: string | null; extra?: Record<string, unknown> },
  ) {
    const id = randomUUID().replace(/-/g, '').slice(0, 20);
    const parentPath = `clubs/${club.id}/divisions/${divisionId}/teams`;
    const data = {
      id, name: t.name, sport: t.sport, rama: teamRama(t.branch), category: t.name,
      season: String(new Date().getFullYear()), status: 'active',
      coachId: '', coachName: '', assistantCoachId: '', assistantCoachName: '', coordinatorId: '', coordinatorName: '',
      maxPlayers: 30, color: '#3b82f6', divisionId, clubId: club.id,
      createdAt: new Date().toISOString(), createdBy: 'player-import', ...(t.extra ?? {}),
    };
    await this.prisma.storeDocument.create({
      data: { path: `${parentPath}/${id}`, parentPath, collection: 'teams', docId: id, clubId: club.id, companyId: club.companyId, data },
    });
    return id;
  }

  /** Alta del jugador en el plantel de su categoría (lo que muestra la ficha del equipo). */
  async assignToTeam(club: { id: string; companyId: string }, playerId: string, playerName: string, divisionId: string, teamId: string) {
    const parentPath = `clubs/${club.id}/divisions/${divisionId}/teams/${teamId}/assignments`;
    const data = { id: playerId, playerId, playerName, playerPhoto: '', teamId, season: String(new Date().getFullYear()), createdAt: new Date().toISOString() };
    const fields = { parentPath, collection: 'assignments', docId: playerId, clubId: club.id, companyId: club.companyId, data };
    await this.prisma.storeDocument.upsert({ where: { path: `${parentPath}/${playerId}` }, create: { path: `${parentPath}/${playerId}`, ...fields }, update: fields });
  }

  /** Categorías (planteles) del club, con su rama. */
  async clubTeams(clubId: string): Promise<ExistingTeam[]> {
    const rows = await this.prisma.storeDocument.findMany({
      where: { clubId, collection: 'teams', parentPath: { startsWith: `clubs/${clubId}/divisions/` } },
      select: { docId: true, parentPath: true, data: true },
    });
    return rows.map((r) => ({
      id: r.docId,
      name: String(((r.data ?? {}) as Record<string, unknown>).name ?? '').trim(),
      divisionId: r.parentPath.split('/')[3] ?? '',
    }));
  }

  private async clubLists(clubId: string) {
    // Los datos del club ya viven en Postgres (se copian de Firestore la primera vez).
    await this.migration.ensureStage1(clubId);
    const [disciplineRows, divisionRows] = await Promise.all([
      this.prisma.clubDiscipline.findMany({
        where: {
          clubId,
          NOT: { status: { in: ['inactive', 'inactivo', 'archived'] } },
        },
        select: { sportId: true, name: true },
      }),
      this.prisma.division.findMany({
        where: { clubId },
        select: { id: true, name: true, sport: true },
      }),
    ]);
    const disciplines: Discipline[] = [];
    for (const item of disciplineRows)
      if (!disciplines.some((d) => fold(d.sportId) === fold(item.sportId)))
        disciplines.push({ sportId: item.sportId, name: item.name });
    const divisions: Division[] = divisionRows.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      sport: item.sport,
    }));
    disciplines.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    divisions.sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { numeric: true }),
    );
    return { disciplines, divisions };
  }

  private async requireClub(clubId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        city: true,
        companyId: true,
        timezone: true,
      },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    return club;
  }
}
