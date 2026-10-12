import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ClubMembershipStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  ApproveJoinRequestDto,
  RejectJoinRequestDto,
} from './dto/review-join-request.dto';

const REQUEST_SELECT = {
  id: true,
  clubId: true,
  status: true,
  role: true,
  message: true,
  reviewedAt: true,
  playerId: true,
  memberId: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class JoinRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, clubId: string, status?: ClubMembershipStatus) {
    await this.requireClub(companyId, clubId);
    return this.prisma.clubMembership.findMany({
      where: {
        companyId,
        clubId,
        status: status ?? 'SOLICITADA',
        role: { in: ['member', 'player'] },
      },
      orderBy: { createdAt: 'asc' },
      select: REQUEST_SELECT,
    });
  }

  /**
   * Fichas del padrón que podrían corresponder al solicitante (mismo email),
   * todavía sin cuenta vinculada. Sirve para vincular en vez de duplicar.
   */
  async candidates(companyId: string, clubId: string, requestId: string) {
    const request = await this.requirePending(companyId, clubId, requestId);
    const email = request.user.email.trim().toLowerCase();
    const where = {
      companyId,
      clubId,
      authUid: null,
      email: { equals: email, mode: 'insensitive' as const },
    };
    const select = {
      id: true,
      firstName: true,
      lastName: true,
      dni: true,
      email: true,
    };
    const [players, members] = await Promise.all([
      this.prisma.player.findMany({ where, select, take: 10 }),
      this.prisma.member.findMany({ where, select, take: 10 }),
    ]);
    return { players, members };
  }

  async approve(
    companyId: string,
    clubId: string,
    requestId: string,
    reviewerFirebaseUid: string,
    dto: ApproveJoinRequestDto,
  ) {
    if (dto.playerId && dto.memberId) {
      throw new BadRequestException(
        'Vinculá a una sola ficha: jugador o socio',
      );
    }
    const request = await this.requirePending(companyId, clubId, requestId);
    const reviewer = await this.requireReviewer(reviewerFirebaseUid);
    const userUid = request.user.firebaseUid;
    const role = dto.role ?? request.role;

    return this.prisma.$transaction(async (tx) => {
      if (dto.playerId) {
        const player = await tx.player.findFirst({
          where: { id: dto.playerId, companyId, clubId },
          select: { id: true, authUid: true },
        });
        if (!player)
          throw new NotFoundException('Jugador no encontrado en este club');
        if (player.authUid && player.authUid !== userUid) {
          throw new ConflictException(
            'Esa ficha ya está vinculada a otra cuenta',
          );
        }
        await tx.player.update({
          where: { id: player.id },
          data: { authUid: userUid },
        });
      }
      if (dto.memberId) {
        const member = await tx.member.findFirst({
          where: { id: dto.memberId, companyId, clubId },
          select: { id: true, authUid: true },
        });
        if (!member)
          throw new NotFoundException('Socio no encontrado en este club');
        if (member.authUid && member.authUid !== userUid) {
          throw new ConflictException(
            'Esa ficha ya está vinculada a otra cuenta',
          );
        }
        await tx.member.update({
          where: { id: member.id },
          data: { authUid: userUid },
        });
      }

      // updateMany con status en el filtro: si otro revisor ya la resolvió, no pisa.
      const updated = await tx.clubMembership.updateMany({
        where: { id: request.id, status: 'SOLICITADA' },
        data: {
          status: 'ACTIVA',
          role,
          reviewedAt: new Date(),
          reviewedByUserId: reviewer.id,
          playerId: dto.playerId ?? null,
          memberId: dto.memberId ?? null,
        },
      });
      if (updated.count === 0)
        throw new ConflictException('La solicitud ya fue resuelta');

      return tx.clubMembership.findUniqueOrThrow({
        where: { id: request.id },
        select: REQUEST_SELECT,
      });
    });
  }

  async reject(
    companyId: string,
    clubId: string,
    requestId: string,
    reviewerFirebaseUid: string,
    dto: RejectJoinRequestDto,
  ) {
    const request = await this.requirePending(companyId, clubId, requestId);
    const reviewer = await this.requireReviewer(reviewerFirebaseUid);
    const updated = await this.prisma.clubMembership.updateMany({
      where: { id: request.id, status: 'SOLICITADA' },
      data: {
        status: 'RECHAZADA',
        reviewedAt: new Date(),
        reviewedByUserId: reviewer.id,
        // El motivo reemplaza el mensaje: queda visible para el solicitante.
        ...(dto.reason?.trim() ? { message: dto.reason.trim() } : {}),
      },
    });
    if (updated.count === 0)
      throw new ConflictException('La solicitud ya fue resuelta');
    return { ok: true };
  }

  private async requireClub(companyId: string, clubId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, companyId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
  }

  private async requirePending(
    companyId: string,
    clubId: string,
    requestId: string,
  ) {
    const request = await this.prisma.clubMembership.findFirst({
      where: { id: requestId, companyId, clubId, status: 'SOLICITADA' },
      select: {
        id: true,
        role: true,
        user: { select: { firebaseUid: true, email: true } },
      },
    });
    if (!request)
      throw new NotFoundException('Solicitud pendiente no encontrada');
    return request;
  }

  private async requireReviewer(firebaseUid: string) {
    const reviewer = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true },
    });
    if (!reviewer) throw new UnauthorizedException('Revisor no encontrado');
    return reviewer;
  }
}
