import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { decryptPii, isEncrypted } from '../common/pii-crypto';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { tempPassword } from '../staff-import/staff-import.rules';
import { UsersService } from '../users/users.service';

export type AccessResult = {
  email: string;
  /** Clave temporal, solo cuando se creó la cuenta o se restableció. */
  password?: string;
  status: 'created' | 'reset' | 'exists';
  message: string;
};

/** Cuentas que la dirección del club no puede restablecer: las de otras autoridades. */
const PROTECTED_ROLES = new Set(['admin', 'fed_admin', 'club_admin', 'manager', 'league_admin', 'municipal_secretary', 'municipal_admin']);

const plain = (v: unknown) => {
  const s = typeof v === 'string' ? v : '';
  return (isEncrypted(s) ? decryptPii(s) : s).trim().toLowerCase();
};

/**
 * Accesos a la app creados desde el legajo: atleta, madre/padre/tutor y staff.
 * La cuenta se crea con una clave temporal que la dirección del club le pasa a la persona.
 * El email queda verificado porque lo carga y lo avala el club.
 */
@Injectable()
export class ClubAccessService {
  private readonly logger = new Logger(ClubAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseAdminService,
    private readonly users: UsersService,
  ) {}

  private async player(companyId: string, clubId: string, playerId: string) {
    const p = await this.prisma.player.findFirst({
      where: { id: playerId, clubId, companyId },
      select: { id: true, firstName: true, lastName: true, email: true, authUid: true, extra: true, companyId: true, clubId: true },
    });
    if (!p) throw new NotFoundException('Atleta no encontrado');
    return p;
  }

  private async userByEmail(email: string) {
    return this.firebase.auth.getUserByEmail(email).catch(() => null);
  }

  async athlete(companyId: string, clubId: string, playerId: string, action: 'create' | 'reset'): Promise<AccessResult> {
    const p = await this.player(companyId, clubId, playerId);
    const email = plain(p.email);
    const name = `${p.firstName} ${p.lastName}`.trim();

    if (action === 'reset') {
      if (!p.authUid) throw new BadRequestException('El atleta todavía no tiene acceso: crealo primero.');
      const user = await this.firebase.auth.getUser(p.authUid).catch(() => null);
      if (!user || user.customClaims?.clubId !== clubId) throw new ForbiddenException('Esa cuenta no pertenece a este club.');
      const password = tempPassword();
      await this.firebase.auth.updateUser(p.authUid, { password });
      return { email: user.email ?? email, password, status: 'reset', message: 'Clave restablecida.' };
    }

    if (!email) throw new BadRequestException('Cargá el email del atleta y guardá el legajo antes de crear el acceso.');
    if (p.authUid) return { email, status: 'exists', message: 'El atleta ya tiene acceso a la app.' };
    if (await this.userByEmail(email))
      return { email, status: 'exists', message: 'Ese email ya tiene cuenta: cuando entre a la app con ese email queda vinculado a su legajo.' };

    const password = tempPassword();
    const record = await this.firebase.auth.createUser({ email, password, displayName: name, emailVerified: true });
    try {
      await this.users.provisionProfileClaims({ uid: record.uid, email, name, role: 'player', companyId: p.companyId, clubId }, undefined, true);
      await this.prisma.player.update({ where: { id: p.id }, data: { authUid: record.uid } });
    } catch (error) {
      await this.firebase.auth.deleteUser(record.uid).catch(() => undefined);
      this.logger.warn(`Acceso atleta ${p.id}: ${String(error)}`);
      throw new BadRequestException('No se pudo crear el acceso del atleta.');
    }
    return { email, password, status: 'created', message: 'Acceso del atleta creado.' };
  }

  async guardian(companyId: string, clubId: string, playerId: string, action: 'create' | 'reset'): Promise<AccessResult> {
    const p = await this.player(companyId, clubId, playerId);
    const email = plain((p.extra as Record<string, unknown> | null)?.guardianEmail);
    if (!email) throw new BadRequestException('Cargá el email del padre / tutor y guardá el legajo antes de crear el acceso.');
    const existing = await this.userByEmail(email);

    if (action === 'reset') {
      // Solo cuentas que creó este club: una cuenta propia del padre la maneja él ("Olvidé mi clave").
      if (!existing || existing.customClaims?.createdByClub !== clubId)
        throw new ForbiddenException('Esa cuenta no la creó el club: que use "Olvidé mi contraseña" en la app.');
      const password = tempPassword();
      await this.firebase.auth.updateUser(existing.uid, { password });
      return { email, password, status: 'reset', message: 'Clave restablecida.' };
    }

    if (existing)
      return {
        email,
        status: 'exists',
        message: existing.emailVerified
          ? 'Ese email ya tiene cuenta: con ella ve al atleta.'
          : 'Ese email ya tiene cuenta, pero sin verificar: tiene que verificar su correo para ver al atleta.',
      };

    const password = tempPassword();
    const record = await this.firebase.auth.createUser({ email, password, emailVerified: true });
    try {
      // Usuario libre (sin empresa): el portal de padres encuentra a sus hijos por este email.
      const known = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!known) await this.prisma.user.create({ data: { firebaseUid: record.uid, email, role: 'user', companyId: null } });
      await this.firebase.auth.setCustomUserClaims(record.uid, { createdByClub: clubId });
    } catch (error) {
      await this.firebase.auth.deleteUser(record.uid).catch(() => undefined);
      this.logger.warn(`Acceso tutor ${p.id}: ${String(error)}`);
      throw new BadRequestException('No se pudo crear el acceso del padre / tutor.');
    }
    return { email, password, status: 'created', message: 'Acceso del padre / tutor creado.' };
  }

  /** Staff del club: restablece la clave (las cuentas de staff se crean al darlo de alta). */
  async staffReset(clubId: string, uid: string): Promise<AccessResult> {
    const doc = await this.prisma.storeDocument.findUnique({ where: { path: `users/${uid}` }, select: { clubId: true, data: true } });
    const data = (doc?.data ?? {}) as Record<string, unknown>;
    if (!doc || (doc.clubId !== clubId && data.clubId !== clubId)) throw new NotFoundException('Persona del staff no encontrada en este club');
    const user = await this.firebase.auth.getUser(uid).catch(() => null);
    if (!user) throw new BadRequestException('Esta persona no tiene cuenta todavía.');
    const roles = [user.customClaims?.role, ...((user.customClaims?.roles as string[] | undefined) ?? [])].filter(Boolean) as string[];
    if (roles.some((r) => PROTECTED_ROLES.has(r)))
      throw new ForbiddenException('No se puede restablecer la clave de una autoridad del club desde acá.');
    const password = tempPassword();
    await this.firebase.auth.updateUser(uid, { password });
    return { email: user.email ?? '', password, status: 'reset', message: 'Clave restablecida.' };
  }
}
