import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { parseBooleanFlag, parsePagination } from '../common/http/pagination';
import { requireCompanyId } from '../common/http/request-context';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';
import { FinanceTransactionsService } from './finance-transactions.service';

@Controller('finance/transactions')
export class FinanceTransactionsController {
  constructor(private readonly financeTransactionsService: FinanceTransactionsService) {}

  @Roles('admin', 'manager')
  @Get('summary')
  summary(
    @Req() req: unknown,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clubId') clubId?: string,
  ) {
    return this.financeTransactionsService.summary(requireCompanyId(req), {
      from,
      to,
      clubId,
    });
  }

  @Roles('admin', 'manager')
  @Get()
  list(
    @Req() req: unknown,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('withMeta') withMeta?: string,
  ) {
    return this.financeTransactionsService.list(requireCompanyId(req), {
      ...parsePagination(limit, offset),
      withMeta: parseBooleanFlag(withMeta),
    });
  }

  @Roles('admin', 'manager')
  @Get(':id')
  getById(@Req() req: unknown, @Param('id') id: string) {
    return this.financeTransactionsService.getById(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager')
  @Post()
  create(@Req() req: unknown, @Body() dto: CreateFinanceTransactionDto) {
    return this.financeTransactionsService.create(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch(':id')
  update(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateFinanceTransactionDto) {
    return this.financeTransactionsService.update(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager')
  @Delete(':id')
  remove(@Req() req: unknown, @Param('id') id: string) {
    return this.financeTransactionsService.remove(requireCompanyId(req), id);
  }
}
