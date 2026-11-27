import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { BankReconciliationService } from './bank-reconciliation.service';
import {
  IgnoreMovementDto,
  ImportStatementDto,
  MatchMovementDto,
  RecordMovementDto,
} from './dto/bank-reconciliation.dto';

const STATUSES = ['pending', 'matched', 'recorded', 'ignored'] as const;

/** Conciliación bancaria: el club sube el extracto y confirma a qué corresponde cada movimiento. */
@Roles('admin', 'manager')
@Controller('clubs/:clubId/bank-reconciliation')
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  private uid(req: unknown) {
    return (req as RequestWithAuth).auth?.uid;
  }

  @Get('summary')
  summary(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.service.summary(requireCompanyId(req), clubId);
  }

  @Get('movements')
  list(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query('status') status = 'pending',
    @Query('limit') limit?: string,
  ) {
    if (!(STATUSES as readonly string[]).includes(status))
      throw new BadRequestException('Estado inválido');
    return this.service.list(
      requireCompanyId(req),
      clubId,
      status as (typeof STATUSES)[number],
      limit ? Number(limit) || 200 : 200,
    );
  }

  @Post('import')
  import(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: ImportStatementDto,
  ) {
    return this.service.importStatement(
      requireCompanyId(req),
      clubId,
      this.uid(req),
      dto,
    );
  }

  @Post('movements/:id/match')
  match(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: MatchMovementDto,
  ) {
    return this.service.match(
      requireCompanyId(req),
      clubId,
      id,
      dto.feeId,
      this.uid(req),
    );
  }

  @Post('movements/:id/record')
  record(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: RecordMovementDto,
  ) {
    return this.service.record(
      requireCompanyId(req),
      clubId,
      id,
      this.uid(req),
      dto,
    );
  }

  @Post('movements/:id/ignore')
  ignore(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: IgnoreMovementDto,
  ) {
    return this.service.ignore(
      requireCompanyId(req),
      clubId,
      id,
      this.uid(req),
      dto.note,
    );
  }

  @Post('movements/:id/undo')
  undo(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.service.undo(requireCompanyId(req), clubId, id);
  }
}
