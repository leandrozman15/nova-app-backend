import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { AuditService, type AuditActor } from '../platform/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { FirestoreMigrationService } from '../roster/firestore-migration.service';
import { UsersService } from '../users/users.service';
import { fold, type Discipline } from '../player-import/player-import.rules';
import type { StaffImportRowDto } from './staff-import.dto';
import { tempPassword, validateStaffRows, type StaffRowResult } from './staff-import.rules';

export type StaffCredential = { row: number; name: string; email: string; role: string; password: string };

/**
 * Implantación del staff de un club desde la plantilla Excel: crea la cuenta de acceso
 * con una clave temporal, el perfil con su rol y la ficha que muestra el listado del staff.
 * Las claves se devuelven una sola vez en la respuesta; no se guardan.
 */
@Injectable()
export class StaffImportService {
  private readonly logger = new Logger(StaffImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseAdminService,
    private readonly users: UsersService,
    private readonly migration: FirestoreMigrationService,
    private readonly audit: AuditService,
  ) {}

  async run(actor: AuditActor, clubId: string, rows: StaffImportRowDto[], dryRun: boolean) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true, name: true, companyId: true } });
    if (!club) throw new NotFoundException('Club no encontrado');
    const disciplines = await this.disciplines(clubId);
    const results = validateStaffRows(rows, { disciplines });
    await this.markExisting(results);

    const importable = results.filter((r) => r.staff && (r.status === 'ok' || r.status === 'warning'));
    const credentials: StaffCredential[] = [];
    if (!dryRun && importable.length > 0) {
      for (const result of importable) {
        const cred = await this.create(club, result);
        if (cred) credentials.push(cred);
      }
      await this.audit.record(actor, 'staff.import', { type: 'Club', id: club.id }, {
        after: { club: club.name, rows: rows.length, created: credentials.length, skipped: results.length - credentials.length },
      });
    }

    const count = (s: StaffRowResult['status']) => results.filter((r) => r.status === s).length;
    return {
      club: { id: club.id, name: club.name },
      dryRun,
      created: credentials.length,
      summary: { total: results.length, ok: count('ok'), warning: count('warning'), error: count('error'), duplicate: count('duplicate') },
      // Sin las claves ni datos personales de más: la planilla ya los tiene.
      results: results.map(({ row, status, errors, warnings, staff }) => ({
        row, status, errors, warnings,
        staff: staff ? { name: `${staff.firstName} ${staff.lastName}`, email: staff.email, role: staff.role } : null,
      })),
      credentials,
    };
  }

  /** Un email que ya tiene cuenta (en Firebase o en la base) no se vuelve a crear. */
  private async markExisting(results: StaffRowResult[]) {
    for (const result of results) {
      if (!result.staff) continue;
      const email = result.staff.email;
      const [inDb, inAuth] = await Promise.all([
        this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }),
        this.firebase.auth.getUserByEmail(email).then(() => true, () => false),
      ]);
      if (inDb || inAuth) {
        result.status = 'duplicate';
        result.errors.push(`Ya existe una cuenta con el email ${email}.`);
      }
    }
  }

  private async create(club: { id: string; companyId: string }, result: StaffRowResult): Promise<StaffCredential | null> {
    const s = result.staff!;
    const name = `${s.firstName} ${s.lastName}`;
    const password = tempPassword();
    let uid: string | null = null;
    try {
      const record = await this.firebase.auth.createUser({ email: s.email, password, displayName: name });
      uid = record.uid;
      await this.users.provisionProfileClaims(
        { uid, email: s.email, name, role: s.role, companyId: club.companyId, clubId: club.id },
        undefined,
        true,
      );
      const data = {
        id: uid, uid, email: s.email, name,
        firstName: s.firstName, lastName: s.lastName,
        phone: s.phone, dni: s.dni, birthDate: s.birthDate, address: s.address, photoUrl: null,
        bloodType: s.bloodType, emergencyContact: s.emergencyContact, emergencyPhone: s.emergencyPhone,
        membershipNumber: s.membershipNumber, specialty: s.specialty, license: s.license, sport: s.sport ?? '',
        parkingIncluded: s.parkingIncluded,
        role: s.role, roles: [s.role], modulePermissions: null,
        clubId: club.id, companyId: club.companyId,
        createdAt: new Date().toISOString(),
        importedBy: 'staff-import',
      };
      const fields = { parentPath: 'users', collection: 'users', docId: uid, clubId: club.id, companyId: club.companyId, data };
      await this.prisma.storeDocument.upsert({ where: { path: `users/${uid}` }, create: { path: `users/${uid}`, ...fields }, update: fields });
      return { row: result.row, name, email: s.email, role: s.role, password };
    } catch (error) {
      // Si quedó la cuenta a medias, se borra para poder reintentar la fila.
      if (uid) await this.firebase.auth.deleteUser(uid).catch(() => undefined);
      result.status = 'error';
      result.errors.push('No se pudo crear la cuenta. Revisá la fila y probá de nuevo.');
      this.logger.warn(`Fila ${result.row}: ${String(error)}`);
      return null;
    }
  }

  private async disciplines(clubId: string): Promise<Discipline[]> {
    await this.migration.ensureStage1(clubId);
    const rows = await this.prisma.clubDiscipline.findMany({
      where: { clubId, NOT: { status: { in: ['inactive', 'inactivo', 'archived'] } } },
      select: { sportId: true, name: true },
    });
    const out: Discipline[] = [];
    for (const item of rows) if (!out.some((d) => fold(d.sportId) === fold(item.sportId))) out.push({ sportId: item.sportId, name: item.name });
    return out;
  }
}
