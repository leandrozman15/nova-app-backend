import { Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
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

    if (!body.uid || !body.role) {
      throw new UnauthorizedException('Missing profile data');
    }

    return this.usersService.provisionProfileClaims({
      uid: body.uid,
      email: body.email,
      name: body.name,
      role: body.role,
      roles: Array.isArray(body.roles) ? body.roles : undefined,
      companyId: body.companyId,
      clubId: body.clubId,
      leagueId: body.leagueId,
      municipalityId: body.municipalityId,
      teamId: body.teamId,
      isFan: body.isFan,
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
