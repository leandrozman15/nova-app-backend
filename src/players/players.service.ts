import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisionProfileActor, UsersService } from '../users/users.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly usersService: UsersService,
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

  async create(companyId: string, dto: CreatePlayerDto, actor: ProvisionProfileActor) {
    const player = await this.prisma.player.create({
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
    await this.syncPlayerClaims(player, actor);
    return player;
  }

  async update(companyId: string, id: string, dto: UpdatePlayerDto, actor: ProvisionProfileActor) {
    const existing = await this.getById(companyId, id);
    const nextAuthUid = dto.authUid ?? dto.uid ?? existing.authUid;
    if (existing.authUid && nextAuthUid && existing.authUid !== nextAuthUid) {
      throw new BadRequestException('Changing a player authUid requires a dedicated identity transfer');
    }

    const player = await this.prisma.player.update({
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
    await this.syncPlayerClaims(player, actor);
    return player;
  }

  async remove(companyId: string, id: string) {
    await this.getById(companyId, id);

    await this.prisma.player.delete({ where: { id } });

    return { ok: true };
  }

  async provisionProfile(input: CreatePlayerDto & { companyId?: string }, actor: ProvisionProfileActor) {
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

    await this.syncPlayerClaims(player, actor, resolvedTeamId);

    return player;
  }

  approveRegistration(companyId: string, dto: CreatePlayerDto, actor: ProvisionProfileActor) {
    return this.provisionProfile({
      ...dto,
      companyId,
      active: dto.active ?? true,
    }, actor);
  }

  private async syncPlayerClaims(
    player: { authUid?: string | null; email?: string | null; firstName: string; lastName: string; companyId: string; clubId: string; teamId?: string | null; active?: boolean },
    actor: ProvisionProfileActor,
    teamId = player.teamId ?? undefined,
  ) {
    if (!player.authUid) return;

    await this.usersService.provisionProfileClaims({
      uid: player.authUid,
      email: player.email ?? undefined,
      name: `${player.firstName} ${player.lastName}`.trim(),
      role: 'player',
      companyId: player.companyId,
      clubId: player.clubId,
      teamId,
      isFan: false,
    }, actor);
  }
}
