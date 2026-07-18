import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { FacilitiesService } from './facilities.service';

@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get()
  list(@Req() req: unknown, @Query('clubId') clubId?: string) {
    return this.facilitiesService.list(requireCompanyId(req), { clubId });
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.facilitiesService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateFacilityDto) {
    return this.facilitiesService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateFacilityDto) {
    return this.facilitiesService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.facilitiesService.remove(requireCompanyId(req), id);
  }
}