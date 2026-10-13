import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { todayIn } from '../bookings/booking-time';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { AuditService, type AuditActor } from '../platform/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ImportRowDto } from './player-import.dto';
import {
  fold,
  validateRows,
  type Discipline,
  type Division,
  type RowResult,
} from './player-import.rules';

const INACTIVE = new Set(['inactive', 'inactivo', 'archived']);

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    out.push(items.slice(index, index + size));
  return out;
}

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
    private readonly firebase: FirebaseAdminService,
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
        where: { companyId: club.companyId, dni: { in: dnis } },
        select: { dni: true, firstName: true, lastName: true, clubId: true },
      }),
      emails.length
        ? this.prisma.player.findMany({
            where: { email: { in: emails, mode: 'insensitive' } },
            select: { email: true },
          })
        : Promise.resolve([] as Array<{ email: string | null }>),
    ]);
    const firestoreDnis = await this.firestoreDnis(club.id, dnis);

    const known = new Map(byDni.map((player) => [player.dni, player]));
    const takenEmails = new Set(
      byEmail.map((player) => (player.email ?? '').toLowerCase()),
    );
    for (const result of results) {
      if (!result.player) continue;
      const existing = known.get(result.player.dni);
      if (existing || firestoreDnis.has(result.player.dni)) {
        result.status = 'duplicate';
        result.errors.push(
          existing
            ? `Ya existe: ${existing.firstName} ${existing.lastName} (DNI ${result.player.dni})${existing.clubId === club.id ? '' : ' en otro club de la misma institución'}.`
            : `Ya está en la consola del club (DNI ${result.player.dni}).`,
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

  private async firestoreDnis(clubId: string, dnis: string[]) {
    const found = new Set<string>();
    try {
      const players = this.firebase.firestore
        .collection('clubs')
        .doc(clubId)
        .collection('players');
      for (const group of chunks(dnis, 30)) {
        const snap = await players.where('dni', 'in', group).get();
        snap.docs.forEach((doc) => {
          const value: unknown = doc.get('dni');
          if (typeof value === 'string' || typeof value === 'number')
            found.add(String(value));
        });
      }
    } catch (error) {
      this.logger.warn(`No se pudo revisar Firestore: ${String(error)}`);
    }
    return found;
  }

  private async create(
    club: { id: string; name: string; companyId: string },
    rows: RowResult[],
    actor: AuditActor,
  ) {
    const batchId = `import-${Date.now()}`;
    const now = new Date().toISOString();
    const done: Array<{ id: string; result: RowResult }> = [];

    for (const result of rows) {
      const player = result.player!;
      try {
        const saved = await this.prisma.player.create({
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
          },
          select: { id: true },
        });
        done.push({ id: saved.id, result });
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

    // Ficha en la consola del club (mismos campos que la inscripción manual).
    const collection = this.firebase.firestore
      .collection('clubs')
      .doc(club.id)
      .collection('players');
    for (const group of chunks(done, 400)) {
      const batch = this.firebase.firestore.batch();
      for (const { id, result } of group) {
        const player = result.player!;
        batch.set(collection.doc(id), {
          id,
          backendId: id,
          firstName: player.firstName,
          lastName: player.lastName,
          dni: player.dni,
          birthDate: player.birthDate,
          gender: player.gender,
          address: player.address ?? '',
          locality: player.locality ?? '',
          province: player.province ?? '',
          photoUrl: '',
          sport: player.sport,
          divisionId: player.divisionId ?? '',
          divisionName: player.divisionName ?? '',
          branch: player.branch,
          position: player.position ?? '',
          membershipNumber: player.membershipNumber ?? '',
          clubId: club.id,
          clubName: club.name,
          email: player.email ?? '',
          phone: player.phone ?? '',
          enableLogin: false,
          hasMedicalCert: player.hasMedicalCert,
          hasMinorAuth: player.hasMinorAuth,
          notes: player.notes ?? '',
          role: 'player',
          roles: ['player'],
          isFan: false,
          status: 'active',
          createdAt: now,
          importedAt: now,
          importBatch: batchId,
          importedBy: actor.email ?? actor.uid,
        });
      }
      try {
        await batch.commit();
      } catch (error) {
        this.logger.error(
          `No se escribieron ${group.length} fichas en Firestore: ${String(error)}`,
        );
        for (const { result } of group)
          result.warnings.push(
            'Se creó en el padrón pero no apareció en la consola: reintentá la implantación.',
          );
      }
    }
    return done.length;
  }

  private async clubLists(clubId: string) {
    const disciplines: Discipline[] = [];
    const divisions: Division[] = [];
    try {
      const club = this.firebase.firestore.collection('clubs').doc(clubId);
      const [disc, div] = await Promise.all([
        club.collection('available_disciplines').get(),
        club.collection('divisions').get(),
      ]);
      for (const doc of disc.docs) {
        const status: unknown = doc.get('status');
        if (typeof status === 'string' && INACTIVE.has(status.toLowerCase()))
          continue;
        const sportId = String(doc.get('sportId') ?? doc.id);
        const name = String(
          doc.get('customName') ?? doc.get('name') ?? sportId,
        );
        if (!disciplines.some((item) => fold(item.sportId) === fold(sportId)))
          disciplines.push({ sportId, name });
      }
      for (const doc of div.docs) {
        const name: unknown = doc.get('name');
        if (typeof name !== 'string' || !name.trim()) continue;
        const sport: unknown = doc.get('sport');
        divisions.push({
          id: doc.id,
          name: name.trim(),
          sport: typeof sport === 'string' ? sport : null,
        });
      }
    } catch (error) {
      this.logger.error(
        `No se leyeron disciplinas del club ${clubId}: ${String(error)}`,
      );
    }
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
