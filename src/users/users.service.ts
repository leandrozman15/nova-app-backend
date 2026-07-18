import { ConflictException, Injectable } from '@nestjs/common';

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';

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
    roles?: string[];
    companyId?: string;
    clubId?: string;
    leagueId?: string;
    municipalityId?: string;
    teamId?: string;
    isFan?: boolean;
  }) {
    const claims: Record<string, unknown> = {
      email: input.email,
      name: input.name,
      role: input.role,
      roles: input.roles ?? [input.role],
      companyId: input.companyId,
      clubId: input.clubId,
      leagueId: input.leagueId,
      municipalityId: input.municipalityId,
      teamId: input.teamId,
      isFan: input.isFan,
    };

    Object.keys(claims).forEach((key) => {
      if (claims[key] === undefined) {
        delete claims[key];
      }
    });

    await this.firebaseAdminService.auth.setCustomUserClaims(input.uid, claims);

    return { ok: true };
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

    await this.prisma.user.upsert({
      where: { firebaseUid: input.uid },
      update: {
        email: input.email ?? `${input.uid}@bootstrap.local`,
        name: input.name ?? 'Super Administrador',
        role: 'admin',
        companyId: company.id,
      },
      create: {
        firebaseUid: input.uid,
        email: input.email ?? `${input.uid}@bootstrap.local`,
        name: input.name ?? 'Super Administrador',
        role: 'admin',
        companyId: company.id,
      },
    });

    return this.provisionProfileClaims({
      uid: input.uid,
      email: input.email,
      name: input.name,
      role: 'admin',
      roles: ['admin'],
      companyId: company.id,
    });
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
