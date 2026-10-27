import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  ) {
    const club = await this.requireClub(clubId);
    const { disciplines, divisions } = await this.clubLists(clubId);
    const today = todayIn(club.timezone);
    const results = validateRows(rows, { disciplines, divisions, today });
    await this.markExisting(club, results);

    const importable = results.filter(
      (result) =>
        result.player &&
        (result.status === 'ok' || result.status === 'warning'),
    );
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
        await this.prisma.player.create({
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
            },
          },
          select: { id: true },
        });
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
