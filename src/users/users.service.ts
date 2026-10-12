import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { RegisterFreeUserDto } from './dto/register-free-user.dto';

export type ProvisionProfileActor = {
  uid: string;
  companyId: string;
  clubId?: string;
};

const GLOBAL_ROLES = new Set([
  'admin',
  'fed_admin',
  'league_admin',
  'municipal_secretary',
  'municipal_admin',
  'municipal_inspector',
]);

const PLATFORM_ROLES = new Set(['admin', 'fed_admin']);
const CLUB_ROLES = new Set([
  'club_admin',
  'manager',
  'coordinator',
  'coach_lvl1',
  'coach_lvl2',
  'coach',
  'player',
  'member',
]);
const CLUB_MANAGERS = new Set(['club_admin', 'manager', 'coordinator']);
const CLUB_PLAYER_PROVISIONERS = new Set([
  'club_admin', 'manager', 'coordinator', 'coach', 'coach_lvl1', 'coach_lvl2',
]);

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  listByCompany(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
    });
  }

  getByFirebaseUid(firebaseUid: string) {
    return this.prisma.user.findUnique({
      where: { firebaseUid },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async switchActiveClub(firebaseUid: string, clubId: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, email: true, name: true, companyId: true },
    });
    if (!user) throw new UnauthorizedException('User profile not found');

    // La empresa sale de la membresía, no del usuario: un usuario libre
    // (sin companyId) puede tener membresías activas en clubes de varias empresas.
    const membership = await this.prisma.clubMembership.findFirst({
      where: {
        userId: user.id,
        clubId,
        status: 'ACTIVA',
      },
      select: { companyId: true, clubId: true, role: true, club: { select: { companyId: true } } },
    });
    if (!membership || membership.club.companyId !== membership.companyId) {
      throw new ForbiddenException('Active club membership required');
    }

    const role = membership.role.trim().toLowerCase();
    const claims: Record<string, unknown> = {
      email: user.email,
      name: user.name ?? undefined,
      companyId: membership.companyId,
      clubId: membership.clubId,
      role,
      roles: [role],
      ...(role === 'member' ? { isFan: true } : {}),
    };
    Object.keys(claims).forEach((key) => {
      if (claims[key] === undefined) delete claims[key];
    });

    await this.firebaseAdminService.auth.setCustomUserClaims(firebaseUid, claims);
    return {
      ok: true,
      companyId: membership.companyId,
      clubId: membership.clubId,
      role,
    };
  }

  /**
   * Alta del usuario libre desde la app pública: cuenta global, sin empresa
   * ni club y sin claims de rol. Idempotente: si ya existe, no lo modifica
   * (un usuario de staff que se "registra" de nuevo no pierde su empresa).
   */
  async registerFreeUser(firebaseUid: string, dto: RegisterFreeUserDto) {
    const existing = await this.getByFirebaseUid(firebaseUid);
    if (existing) return { created: false, user: existing };

    const firebaseUser = await this.firebaseAdminService.auth.getUser(firebaseUid);
    if (!firebaseUser.email) {
      throw new BadRequestException('La cuenta necesita un email verificado');
    }

    const emailOwner = await this.prisma.user.findUnique({
      where: { email: firebaseUser.email },
      select: { id: true },
    });
    if (emailOwner) {
      throw new ConflictException('Ya existe un perfil con ese email');
    }

    const user = await this.prisma.user.create({
      data: {
        firebaseUid,
        email: firebaseUser.email,
        name: dto.name?.trim() || firebaseUser.displayName || null,
        role: 'user',
        companyId: null,
      },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { created: true, user };
  }

  async listMyMemberships(firebaseUid: string) {
    const user = await this.requireUser(firebaseUid);
    return this.prisma.clubMembership.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        clubId: true,
        status: true,
        role: true,
        message: true,
        reviewedAt: true,
        createdAt: true,
        club: { select: { id: true, name: true, logoUrl: true, city: true } },
      },
    });
  }

  async createJoinRequest(firebaseUid: string, dto: CreateJoinRequestDto) {
    const user = await this.requireUser(firebaseUid);
    const club = await this.prisma.club.findFirst({
      where: { id: dto.clubId, isPublic: true },
      select: { id: true, companyId: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');

    const existing = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: user.id, clubId: club.id } },
      select: { id: true, status: true },
    });
    if (existing?.status === 'ACTIVA') {
      throw new ConflictException('Ya sos parte de este club');
    }
    if (existing?.status === 'SOLICITADA') {
      throw new ConflictException('Ya tenés una solicitud pendiente en este club');
    }

    const data = {
      companyId: club.companyId,
      role: dto.role,
      status: 'SOLICITADA' as const,
      message: dto.message?.trim() || null,
      reviewedAt: null,
      reviewedByUserId: null,
      playerId: null,
      memberId: null,
    };
    // Una solicitud RECHAZADA o una BAJA se puede volver a pedir.
    return this.prisma.clubMembership.upsert({
      where: { userId_clubId: { userId: user.id, clubId: club.id } },
      update: data,
      create: { ...data, userId: user.id, clubId: club.id },
      select: { id: true, clubId: true, status: true, role: true, createdAt: true },
    });
  }

  async cancelJoinRequest(firebaseUid: string, membershipId: string) {
    const user = await this.requireUser(firebaseUid);
    const result = await this.prisma.clubMembership.deleteMany({
      where: { id: membershipId, userId: user.id, status: 'SOLICITADA' },
    });
    if (result.count === 0) throw new NotFoundException('Solicitud pendiente no encontrada');
    return { ok: true };
  }

  private async requireUser(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, companyId: true },
    });
    if (!user) throw new UnauthorizedException('Perfil no registrado');
    return user;
  }

  async hasAdminUsers() {
    const count = await this.prisma.user.count({
      where: { role: 'admin' },
    });

    return count > 0;
  }

  async provisionProfileClaims(input: {
    uid: string;
    email?: string;
    name?: string;
    role: string;
    companyId?: string;
    clubId?: string;
    leagueId?: string;
    municipalityId?: string;
    teamId?: string;
    isFan?: boolean;
  }, actor?: ProvisionProfileActor, allowFirstAdminBootstrap = false) {
    const normalizedRole = input.role.trim().toLowerCase();
    if (!GLOBAL_ROLES.has(normalizedRole) && !CLUB_ROLES.has(normalizedRole)) {
      throw new BadRequestException('Unsupported profile role');
    }

    const companyId = input.companyId ?? actor?.companyId;
    if (!companyId) throw new BadRequestException('Missing company');
    if (input.clubId && !CLUB_ROLES.has(normalizedRole)) {
      throw new BadRequestException('Global roles cannot be assigned to a club membership');
    }
    if (CLUB_ROLES.has(normalizedRole) && !input.clubId) {
      throw new BadRequestException('Club-scoped roles require a club membership');
    }

    const [firebaseUser, company, targetClub, actorUser] = await Promise.all([
      this.firebaseAdminService.auth.getUser(input.uid),
      this.prisma.company.findUnique({ where: { id: companyId } }),
      input.clubId
        ? this.prisma.club.findUnique({
            where: { id: input.clubId },
            select: { id: true, companyId: true },
          })
        : Promise.resolve(null),
      actor
        ? this.prisma.user.findFirst({
            where: { firebaseUid: actor.uid },
            select: { id: true, role: true, companyId: true },
          })
        : Promise.resolve(null),
    ]);

    if (!company) throw new NotFoundException('Company not found');
    if (input.clubId && !targetClub) throw new NotFoundException('Club not found');
    if (targetClub && targetClub.companyId !== companyId) {
      throw new ConflictException('Club does not belong to the requested company');
    }

    if (!allowFirstAdminBootstrap) {
      if (!actor || !actorUser) throw new UnauthorizedException('Provisioning actor not found');
      await this.assertActorCanProvision(actor, actorUser, companyId, input.clubId, normalizedRole);
    }

    const email = input.email ?? firebaseUser.email ?? `${input.uid}@bootstrap.local`;
    const name = input.name ?? firebaseUser.displayName ?? null;
    const storedGlobalRole = GLOBAL_ROLES.has(normalizedRole) ? normalizedRole : undefined;
    const user = await this.prisma.$transaction(async (transaction) => {
      const savedUser = await transaction.user.upsert({
        where: { firebaseUid: input.uid },
        update: {
          email,
          name,
          companyId,
          role: storedGlobalRole ?? 'user',
        },
        create: {
          firebaseUid: input.uid,
          email,
          name,
          role: storedGlobalRole ?? 'user',
          companyId,
        },
      });

      if (input.clubId) {
        await transaction.clubMembership.upsert({
          where: { userId_clubId: { userId: savedUser.id, clubId: input.clubId } },
          update: { companyId, role: normalizedRole, status: 'ACTIVA' },
          create: {
            userId: savedUser.id,
            companyId,
            clubId: input.clubId,
            role: normalizedRole,
            status: 'ACTIVA',
          },
        });
      }

      return savedUser;
    });

    const claims: Record<string, unknown> = {
      email,
      name: name ?? undefined,
      role: normalizedRole,
      roles: [normalizedRole],
      companyId: company.id,
      clubId: input.clubId,
      leagueId: input.leagueId,
      municipalityId: input.municipalityId,
      teamId: input.teamId,
      isFan: normalizedRole === 'member' || input.isFan,
    };
    Object.keys(claims).forEach((key) => {
      if (claims[key] === undefined) delete claims[key];
    });

    await this.firebaseAdminService.auth.setCustomUserClaims(user.firebaseUid, claims);
    return { ok: true, userId: user.id };
  }

  private async assertActorCanProvision(
    actor: ProvisionProfileActor,
    actorUser: { id: string; role: string; companyId: string | null },
    targetCompanyId: string,
    targetClubId?: string,
    targetRole?: string,
  ) {
    const actorRole = actorUser.role.trim().toLowerCase();
    // Los roles globales solo valen dentro de la empresa del usuario.
    const actorOwnsTenant = actorUser.companyId === actor.companyId;
    const isPlatformRole = actorOwnsTenant && PLATFORM_ROLES.has(actorRole);
    const isCompanyAuthority = actorOwnsTenant && GLOBAL_ROLES.has(actorRole);

    if (!isPlatformRole && actor.companyId !== targetCompanyId) {
      throw new ForbiddenException('Cannot provision a user in another company');
    }
    if (!targetClubId) {
      if (!isCompanyAuthority) throw new ForbiddenException('Global profiles require an authority role');
      return;
    }
    if (isCompanyAuthority) return;
    if (!actor.clubId || actor.clubId !== targetClubId) {
      throw new ForbiddenException('Actor cannot provision users for this club');
    }

    const allowedProvisionerRoles = targetRole === 'player' || targetRole === 'member'
      ? [...CLUB_MANAGERS, ...CLUB_PLAYER_PROVISIONERS]
      : [...CLUB_MANAGERS];

    const membership = await this.prisma.clubMembership.findFirst({
      where: {
        userId: actorUser.id,
        companyId: actor.companyId,
        clubId: targetClubId,
        status: 'ACTIVA',
        club: { is: { companyId: actor.companyId } },
        role: { in: [...new Set(allowedProvisionerRoles)] },
      },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('Active club manager membership required');
  }

  async bootstrapFirstAdmin(input: { uid: string; email?: string; name?: string }) {
    const hasAdmins = await this.hasAdminUsers();

    if (hasAdmins) {
      throw new ConflictException('Admin bootstrap is already completed');
    }

    const company =
      (await this.prisma.company.findFirst({ orderBy: { createdAt: 'asc' } })) ||
      (await this.prisma.company.create({
        data: { name: 'Fluxion Sport' },
      }));

    return this.provisionProfileClaims({
      uid: input.uid,
      email: input.email,
      name: input.name,
      role: 'admin',
      companyId: company.id,
    }, undefined, true);
  }

  async removeByFirebaseUid(companyId: string, firebaseUid: string) {
    const [playerResult, userResult] = await this.prisma.$transaction([
      this.prisma.player.deleteMany({
        where: {
          companyId,
          authUid: firebaseUid,
        },
      }),
      this.prisma.user.deleteMany({
        where: {
          companyId,
          firebaseUid,
        },
      }),
    ]);

    await this.firebaseAdminService.auth.deleteUser(firebaseUid).catch((error: unknown) => {
      const code = (error as { code?: string } | null)?.code;

      if (code !== 'auth/user-not-found') {
        throw error;
      }
    });

    return {
      ok: true,
      removed: {
        players: playerResult.count,
        users: userResult.count,
      },
    };
  }
}
