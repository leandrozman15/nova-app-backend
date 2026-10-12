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

    const membership = await this.prisma.clubMembership.findFirst({
      where: {
        userId: user.id,
        companyId: user.companyId,
        clubId,
        status: 'ACTIVA',
        club: { is: { companyId: user.companyId } },
      },
      select: { companyId: true, clubId: true, role: true },
    });
    if (!membership) throw new ForbiddenException('Active club membership required');

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
            where: { firebaseUid: actor.uid, companyId: actor.companyId },
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
    actorUser: { id: string; role: string; companyId: string },
    targetCompanyId: string,
    targetClubId?: string,
    targetRole?: string,
  ) {
    const actorRole = actorUser.role.trim().toLowerCase();
    const isPlatformRole = PLATFORM_ROLES.has(actorRole);
    const isCompanyAuthority = GLOBAL_ROLES.has(actorRole);

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
        companyId: actorUser.companyId,
        clubId: targetClubId,
        status: 'ACTIVA',
        club: { is: { companyId: actorUser.companyId } },
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
