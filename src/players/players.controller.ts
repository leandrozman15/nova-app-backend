import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
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

  @Public()
  @Post('provision-profile')
  provisionProfile(@Body() dto: CreatePlayerDto & { companyId?: string }) {
    return this.playersService.provisionProfile(dto);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreatePlayerDto) {
    return this.playersService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdatePlayerDto) {
    return this.playersService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.playersService.remove(requireCompanyId(req), id);
  }
}
