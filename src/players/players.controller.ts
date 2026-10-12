import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { requireCompanyId } from '../common/http/request-context';
import type { ProvisionProfileActor } from '../users/users.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { PlayersService } from './players.service';

@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Roles('admin', 'manager')
  @Get()
  list(@Req() req: unknown) {
    return this.playersService.list(requireCompanyId(req));
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get('me')
  getMe(@Req() req: unknown) {
    const typedReq = req as { auth?: { uid?: string }; companyId?: string };

    if (!typedReq.auth?.uid) {
      throw new UnauthorizedException('Missing auth context');
    }

    return this.playersService.getByAuthUid(requireCompanyId(req), typedReq.auth.uid);
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.playersService.getById(requireCompanyId(req), id);
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
  provisionProfile(@Req() req: unknown, @Body() dto: CreatePlayerDto & { companyId?: string }) {
    return this.playersService.provisionProfile(dto, requireProvisionActor(req));
  }

  @Roles('admin', 'manager', 'club_admin', 'coach', 'coordinator')
  @Post('approve-registration')
  approveRegistration(@Req() req: unknown, @Body() dto: CreatePlayerDto) {
    return this.playersService.approveRegistration(requireCompanyId(req), dto, requireProvisionActor(req));
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreatePlayerDto) {
    return this.playersService.create(requireCompanyId(req), dto, requireProvisionActor(req));
  }

  @Roles('admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdatePlayerDto) {
    return this.playersService.update(requireCompanyId(req), id, dto, requireProvisionActor(req));
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.playersService.remove(requireCompanyId(req), id);
  }
}

function requireProvisionActor(req: unknown): ProvisionProfileActor {
  const typedReq = req as RequestWithAuth;
  if (!typedReq.auth?.uid || !typedReq.companyId) {
    throw new UnauthorizedException('Missing provisioning actor context');
  }
  return {
    uid: typedReq.auth.uid,
    companyId: typedReq.companyId,
    clubId: typedReq.auth.clubId,
  };
}
