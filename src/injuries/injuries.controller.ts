import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreateInjuryReportDto } from './dto/create-injury-report.dto';
import { UpdateInjuryReportDto } from './dto/update-injury-report.dto';
import { InjuriesService } from './injuries.service';

@Controller('injuries')
export class InjuriesController {
  constructor(private readonly injuriesService: InjuriesService) {}

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get()
  list(
    @Req() req: unknown,
    @Query('clubId') clubId?: string,
    @Query('teamId') teamId?: string,
    @Query('playerId') playerId?: string,
    @Query('status') status?: string,
  ) {
    return this.injuriesService.list(requireCompanyId(req), {
      clubId,
      teamId,
      playerId,
      status,
    });
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.injuriesService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateInjuryReportDto) {
    return this.injuriesService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateInjuryReportDto) {
    return this.injuriesService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager', 'coach')
  @Patch(':id/resolve')
  resolve(@Req() req: unknown, @Param('id') id: string, @Query('endDate') endDate?: string) {
    return this.injuriesService.resolve(
      requireCompanyId(req),
      id,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Roles('admin', 'manager', 'coach')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.injuriesService.remove(requireCompanyId(req), id);
  }
}
