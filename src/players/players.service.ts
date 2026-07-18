import { Injectable, NotFoundException } from '@nestjs/common';

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  list(companyId: string) {
    return this.prisma.player.findMany({
      where: { companyId },
      include: { club: true, team: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const player = await this.prisma.player.findFirst({
      where: { id, companyId },
      include: { club: true, team: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return player;
  }

  async getByAuthUid(companyId: string, authUid: string) {
    const player = await this.prisma.player.findFirst({
      where: { companyId, authUid },
      include: { club: true, team: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return player;
  }

  create(companyId: string, dto: CreatePlayerDto) {
    return this.prisma.player.create({
      data: {
        companyId,
        authUid: dto.authUid ?? dto.uid,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        clubId: dto.clubId,
        teamId: dto.teamId,
        dni: dto.dni,
        position: dto.position,
        birthDate: dto.birthDate,
        active: dto.active,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdatePlayerDto) {
    await this.getById(companyId, id);

    return this.prisma.player.update({
      where: { id },
      data: {
        authUid: dto.authUid ?? dto.uid,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        clubId: dto.clubId,
        teamId: dto.teamId,
        dni: dto.dni,
        position: dto.position,
        birthDate: dto.birthDate,
        active: dto.active,
      },
    });
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.player.delete({ where: { id } });

    return { ok: true };
  }

  async provisionProfile(input: CreatePlayerDto & { companyId?: string }) {
    const authUid = input.authUid ?? input.uid;
    const resolvedCompanyId =
      input.companyId ||
      (await this.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { companyId: true },
      }))?.companyId;

    if (!resolvedCompanyId) {
      throw new NotFoundException('Club not found');
    }

    if (authUid) {
      const firebaseUser = await this.firebaseAdminService.auth.getUser(authUid).catch(() => null);

      if (!firebaseUser) {
        throw new NotFoundException('Player auth user not found');
      }

      if (firebaseUser && input.email && firebaseUser.email && firebaseUser.email !== input.email) {
        throw new NotFoundException('Player profile mismatch');
      }
    }

    const existing = await this.prisma.player.findFirst({
      where: {
        companyId: resolvedCompanyId,
        OR: [
          authUid ? { authUid } : undefined,
          input.email ? { email: input.email } : undefined,
        ].filter(Boolean) as Array<{ authUid?: string; email?: string }>,
      },
    });

    const player = existing
      ? await this.prisma.player.update({
          where: { id: existing.id },
          data: {
            authUid,
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            clubId: input.clubId,
            teamId: input.teamId,
            dni: input.dni,
            position: input.position,
            birthDate: input.birthDate,
            active: input.active,
          },
        })
      : await this.prisma.player.create({
          data: {
            companyId: resolvedCompanyId,
            authUid,
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            clubId: input.clubId,
            teamId: input.teamId,
            dni: input.dni,
            position: input.position,
            birthDate: input.birthDate,
            active: input.active,
          },
        });

    if (authUid) {
      const claims: Record<string, unknown> = {
        email: input.email,
        name: `${input.firstName} ${input.lastName}`.trim(),
        role: 'player',
        roles: ['player'],
        companyId: resolvedCompanyId,
        clubId: input.clubId,
        teamId: input.teamId,
        isFan: false,
      };

      Object.keys(claims).forEach((key) => {
        if (claims[key] === undefined) {
          delete claims[key];
        }
      });

      await this.firebaseAdminService.auth.setCustomUserClaims(authUid, claims);
    }

    return player;
  }
}
