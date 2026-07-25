import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
        photoUrl: dto.photoUrl,
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
        photoUrl: dto.photoUrl,
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

    let resolvedTeamId: string | undefined;
    if (input.teamId) {
      const team = await this.prisma.team.findFirst({
        where: {
          id: input.teamId,
          companyId: resolvedCompanyId,
          clubId: input.clubId,
        },
        select: { id: true },
      });

      resolvedTeamId = team?.id;
    }

    if (authUid) {
      const firebaseUser = await this.firebaseAdminService.auth.getUser(authUid).catch(() => null);

      if (!firebaseUser) {
        throw new NotFoundException('Player auth user not found');
      }

      if (firebaseUser && input.email && firebaseUser.email && firebaseUser.email !== input.email) {
        throw new NotFoundException('Player profile mismatch');
      }

      await this.prisma.user.upsert({
        where: { firebaseUid: authUid },
        update: {
          email: input.email ?? firebaseUser?.email ?? `${authUid}@bootstrap.local`,
          name: `${input.firstName} ${input.lastName}`.trim(),
          role: 'player',
          companyId: resolvedCompanyId,
        },
        create: {
          firebaseUid: authUid,
          email: input.email ?? firebaseUser?.email ?? `${authUid}@bootstrap.local`,
          name: `${input.firstName} ${input.lastName}`.trim(),
          role: 'player',
          companyId: resolvedCompanyId,
        },
      });
    }

    const identityFilters = [authUid ? { authUid } : undefined, input.email ? { email: input.email } : undefined].filter(
      Boolean,
    ) as Array<{ authUid?: string; email?: string }>;

    const existing =
      identityFilters.length > 0
        ? await this.prisma.player.findFirst({
            where: {
              companyId: resolvedCompanyId,
              OR: identityFilters,
            },
          })
        : null;

    let player;
    try {
      player = existing
        ? await this.prisma.player.update({
            where: { id: existing.id },
            data: {
              authUid,
              email: input.email,
              photoUrl: input.photoUrl,
              firstName: input.firstName,
              lastName: input.lastName,
              clubId: input.clubId,
              teamId: resolvedTeamId,
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
              photoUrl: input.photoUrl,
              firstName: input.firstName,
              lastName: input.lastName,
              clubId: input.clubId,
              teamId: resolvedTeamId,
              dni: input.dni,
              position: input.position,
              birthDate: input.birthDate,
              active: input.active,
            },
          });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Player already exists with the same authUid/email/dni');
        }

        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid relation in player registration payload');
        }
      }

      throw error;
    }

    if (authUid) {
      const claims: Record<string, unknown> = {
        email: input.email,
        name: `${input.firstName} ${input.lastName}`.trim(),
        role: 'player',
        roles: ['player'],
        companyId: resolvedCompanyId,
        clubId: input.clubId,
        teamId: resolvedTeamId,
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

  approveRegistration(companyId: string, dto: CreatePlayerDto) {
    return this.provisionProfile({
      ...dto,
      companyId,
      active: dto.active ?? true,
    });
  }
}
