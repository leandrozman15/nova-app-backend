import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';

import { NoTenant } from '../common/decorators/no-tenant.decorator';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { RegisterFreeUserDto } from './dto/register-free-user.dto';
import { SetActiveClubContextDto } from './dto/set-active-club-context.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Get('bootstrap')
  async bootstrap() {
    return { hasAdminUsers: await this.usersService.hasAdminUsers() };
  }

  @Public()
  @Post('bootstrap-admin')
  async bootstrapAdmin(@Req() req: unknown) {
    const typedReq = req as RequestWithAuth & { body?: any };
    const body = typedReq.body ?? {};

    if (!body.uid) {
      throw new UnauthorizedException('Missing user id');
    }

    return this.usersService.bootstrapFirstAdmin({
      uid: body.uid,
      email: body.email,
      name: body.name,
    });
  }

  @Roles(
    'admin',
    'fed_admin',
    'league_admin',
    'municipal_secretary',
    'municipal_admin',
    'club_admin',
    'coordinator',
    'coach_lvl1',
    'coach_lvl2',
    'coach',
    'manager',
  )
  @Post('provision-profile')
  async provisionProfile(@Req() req: unknown) {
    const typedReq = req as RequestWithAuth & { body?: any };
    const body = typedReq.body ?? {};

    if (!body.uid || !body.role || !typedReq.auth?.uid || !typedReq.companyId) {
      throw new UnauthorizedException('Missing profile data');
    }

    return this.usersService.provisionProfileClaims({
      uid: body.uid,
      email: body.email,
      name: body.name,
      role: body.role,
      companyId: body.companyId ?? typedReq.companyId,
      clubId: body.clubId,
      leagueId: body.leagueId,
      municipalityId: body.municipalityId,
      teamId: body.teamId,
      isFan: body.isFan,
    }, {
      uid: typedReq.auth.uid,
      companyId: typedReq.companyId,
      clubId: typedReq.auth.clubId,
    });
  }

  @Roles('admin', 'manager')
  @Get()
  async list(@Req() req: unknown) {
    const typedReq = req as RequestWithAuth;

    if (!typedReq.companyId) {
      throw new UnauthorizedException('Missing tenant in request');
    }

    return this.usersService.listByCompany(typedReq.companyId);
  }

  @Get('me')
  async me(@Req() req: unknown) {
    const typedReq = req as RequestWithAuth;

    if (!typedReq.auth?.uid) {
      throw new UnauthorizedException('Missing auth context');
    }

    return this.usersService.getByFirebaseUid(typedReq.auth.uid);
  }

  /** Alta del usuario libre (app pública). Idempotente. */
  @NoTenant()
  @Post('me/register')
  async registerFree(@Req() req: unknown, @Body() dto: RegisterFreeUserDto) {
    const auth = requireAuth(req);
    return this.usersService.registerFreeUser(auth.uid, dto);
  }

  @NoTenant()
  @Get('me/memberships')
  async myMemberships(@Req() req: unknown) {
    return this.usersService.listMyMemberships(requireAuth(req).uid);
  }

  @NoTenant()
  @Post('me/join-requests')
  async createJoinRequest(@Req() req: unknown, @Body() dto: CreateJoinRequestDto) {
    return this.usersService.createJoinRequest(requireAuth(req).uid, dto);
  }

  @NoTenant()
  @Delete('me/join-requests/:id')
  async cancelJoinRequest(@Req() req: unknown, @Param('id') id: string) {
    return this.usersService.cancelJoinRequest(requireAuth(req).uid, id);
  }

  @Post('me/active-club')
  async switchActiveClub(@Req() req: unknown, @Body() dto: SetActiveClubContextDto) {
    const typedReq = req as RequestWithAuth;
    if (!typedReq.auth?.uid) {
      throw new UnauthorizedException('Missing auth context');
    }
    return this.usersService.switchActiveClub(typedReq.auth.uid, dto.clubId);
  }

  @Roles('admin', 'manager')
  @Delete(':firebaseUid')
  async removeByFirebaseUid(@Req() req: unknown, @Param('firebaseUid') firebaseUid: string) {
    const typedReq = req as RequestWithAuth;

    if (!typedReq.companyId) {
      throw new UnauthorizedException('Missing tenant in request');
    }

    return this.usersService.removeByFirebaseUid(typedReq.companyId, firebaseUid);
  }
}

function requireAuth(req: unknown) {
  const auth = (req as RequestWithAuth).auth;
  if (!auth?.uid) throw new UnauthorizedException('Missing auth context');
  return auth;
}
