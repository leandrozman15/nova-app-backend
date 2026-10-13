import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditActor } from './audit.service';
import {
  AddPlatformAdminDto,
  UpdatePlatformAdminDto,
} from './dto/platform.dto';

/** Altas y bajas de administradores de Fluxion (pocas cuentas, todo auditado). */
@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.platformAdmin.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async add(actor: AuditActor, dto: AddPlatformAdminDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      select: { firebaseUid: true, email: true },
    });
    if (!user)
      throw new NotFoundException(
        'Esa persona primero tiene que tener cuenta en Fluxion (app o consola).',
      );
    const existing = await this.prisma.platformAdmin.findUnique({
      where: { firebaseUid: user.firebaseUid },
    });
    if (existing?.active)
      throw new ConflictException('Ya es administrador de Fluxion.');
    const admin = existing
      ? await this.prisma.platformAdmin.update({
          where: { id: existing.id },
          data: { active: true, role: dto.role },
        })
      : await this.prisma.platformAdmin.create({
          data: {
            firebaseUid: user.firebaseUid,
            email: user.email,
            role: dto.role,
            createdByUid: actor.uid,
          },
        });
    await this.audit.record(
      actor,
      'platform.admin.add',
      { type: 'PlatformAdmin', id: admin.id },
      { before: existing ?? null, after: admin },
    );
    return admin;
  }

  async update(actor: AuditActor, id: string, dto: UpdatePlatformAdminDto) {
    const before = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('Administrador no encontrado');
    if (before.firebaseUid === actor.uid && dto.active === false)
      throw new BadRequestException('No podés darte de baja a vos mismo.');
    const after = await this.prisma.platformAdmin.update({
      where: { id },
      data: dto,
    });
    await this.audit.record(
      actor,
      dto.active === false ? 'platform.admin.disable' : 'platform.admin.update',
      { type: 'PlatformAdmin', id },
      { before, after },
    );
    return after;
  }
}
