import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { ListPublicClubsDto } from './dto/list-public-clubs.dto';
import { PublicService } from './public.service';

/** Vidriera: lectura solo para usuarios con cuenta, con rate limit y caché corta. */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get('clubs')
  @Header('Cache-Control', 'private, max-age=60')
  listClubs(@Query() query: ListPublicClubsDto) {
    return this.service.listClubs(query);
  }

  @Get('clubs/:clubId')
  @Header('Cache-Control', 'private, max-age=60')
  getClub(@Param('clubId') clubId: string) {
    return this.service.getClub(clubId);
  }

  @Get('clubs/:clubId/facilities')
  @Header('Cache-Control', 'private, max-age=60')
  listFacilities(@Param('clubId') clubId: string) {
    return this.service.listFacilities(clubId);
  }

  @Get('clubs/:clubId/facilities/:facilityId/availability')
  @Header('Cache-Control', 'private, max-age=30')
  availability(
    @Param('clubId') clubId: string,
    @Param('facilityId') facilityId: string,
  ) {
    return this.service.facilityAvailability(clubId, facilityId);
  }
}
