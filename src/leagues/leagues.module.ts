import { Module } from '@nestjs/common';

import { LeagueFixtureService } from './league-fixture.service';
import { LeaguesController } from './leagues.controller';
import { LeaguesService } from './leagues.service';

@Module({
  controllers: [LeaguesController],
  providers: [LeaguesService, LeagueFixtureService],
})
export class LeaguesModule {}
