import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { CreateFacilityRentalDto } from './dto/create-facility-rental.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { UpdateFacilityRentalDto } from './dto/update-facility-rental.dto';
import { FacilitiesService } from './facilities.service';

@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get('rentals')
  listRentals(
    @Req() req: unknown,
    @Query('clubId') clubId?: string,
    @Query('facilityId') facilityId?: string
  ) {
    return this.facilitiesService.listRentals(requireCompanyId(req), { clubId, facilityId });
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get('rentals/:id')
  getRentalById(@Req() req: unknown, @Param('id') id: string) {
    return this.facilitiesService.getRentalById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager')
  @Post('rentals')
  createRental(@Req() req: unknown, @Body() dto: CreateFacilityRentalDto) {
    return this.facilitiesService.createRental(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch('rentals/:id')
  updateRental(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateFacilityRentalDto) {
    return this.facilitiesService.updateRental(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager')
  @Delete('rentals/:id')
  removeRental(@Req() req: unknown, @Param('id') id: string) {
    return this.facilitiesService.removeRental(requireCompanyId(req), id);
  }

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