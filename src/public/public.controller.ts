import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { ListPublicClubsDto } from './dto/list-public-clubs.dto';
import { PublicService } from './public.service';

/** Vidriera: lectura pública sin login, con rate limit y caché corta. */
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get('clubs')
  @Header('Cache-Control', 'public, max-age=60')
  listClubs(@Query() query: ListPublicClubsDto) {
    return this.service.listClubs(query);
  }

  @Get('clubs/:clubId')
  @Header('Cache-Control', 'public, max-age=60')
  getClub(@Param('clubId') clubId: string) {
    return this.service.getClub(clubId);
  }

  @Get('clubs/:clubId/facilities')
  @Header('Cache-Control', 'public, max-age=60')
  listFacilities(@Param('clubId') clubId: string) {
    return this.service.listFacilities(clubId);
  }

  @Get('clubs/:clubId/facilities/:facilityId/availability')
  @Header('Cache-Control', 'public, max-age=30')
  availability(
    @Param('clubId') clubId: string,
    @Param('facilityId') facilityId: string,
  ) {
    return this.service.facilityAvailability(clubId, facilityId);
  }
}
