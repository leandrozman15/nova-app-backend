import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreateMunicipalityDto } from './dto/create-municipality.dto';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';
import { MunicipalitiesService } from './municipalities.service';

@Controller('municipalities')
export class MunicipalitiesController {
  constructor(private readonly municipalitiesService: MunicipalitiesService) {}

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'manager')
  @Get()
  list(@Req() req: unknown) {
    return this.municipalitiesService.list(requireCompanyId(req));
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'manager')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.municipalitiesService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateMunicipalityDto) {
    return this.municipalitiesService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateMunicipalityDto) {
    return this.municipalitiesService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'fed_admin', 'municipal_secretary', 'municipal_admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.municipalitiesService.remove(requireCompanyId(req), id);
  }
}
