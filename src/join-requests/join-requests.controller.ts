import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ClubMembershipStatus } from '@prisma/client';

import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import {
  ApproveJoinRequestDto,
  RejectJoinRequestDto,
} from './dto/review-join-request.dto';
import { JoinRequestsService } from './join-requests.service';

/** Bandeja del club: solicitudes de usuarios libres para unirse como socio o jugador. */
@Roles('admin', 'club_admin', 'manager', 'coordinator')
@Controller('clubs/:clubId/join-requests')
export class JoinRequestsController {
  constructor(private readonly service: JoinRequestsService) {}

  @Get()
  list(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query(
      'status',
      new ParseEnumPipe(ClubMembershipStatus, { optional: true }),
    )
    status?: ClubMembershipStatus,
  ) {
    requireClubScope(req, clubId);
    return this.service.list(requireCompanyId(req), clubId, status);
  }

  @Get(':id/candidates')
  candidates(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    requireClubScope(req, clubId);
    return this.service.candidates(requireCompanyId(req), clubId, id);
  }

  @Post(':id/approve')
  approve(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: ApproveJoinRequestDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.approve(
      requireCompanyId(req),
      clubId,
      id,
      reviewerUid(req),
      dto,
    );
  }

  @Post(':id/reject')
  reject(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: RejectJoinRequestDto,
  ) {
    requireClubScope(req, clubId);
    return this.service.reject(
      requireCompanyId(req),
      clubId,
      id,
      reviewerUid(req),
      dto,
    );
  }
}

function reviewerUid(req: unknown): string {
  return (req as RequestWithAuth).auth!.uid;
}
