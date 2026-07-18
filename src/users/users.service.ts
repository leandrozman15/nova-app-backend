import { Injectable } from '@nestjs/common';

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
}
