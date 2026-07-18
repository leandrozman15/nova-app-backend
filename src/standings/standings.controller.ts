import { Controller, Get, Param, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { StandingsService } from './standings.service';

@Controller('standings')
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':leagueId')
  byLeague(@Req() req: unknown, @Param('leagueId') leagueId: string) {
    return this.standingsService.byLeague(requireCompanyId(req), leagueId);
  }
}
