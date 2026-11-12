import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { ConnectInvoicingDto, UpdateInvoicingDto } from './dto/invoicing.dto';
import { InvoicingService } from './invoicing.service';

/** Facturación electrónica ARCA del club (consola). */
@Roles('admin', 'club_admin', 'manager')
@Controller('clubs/:clubId/invoicing')
export class ClubInvoicingController {
  constructor(private readonly service: InvoicingService) {}

  @Get()
  status(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.status(requireCompanyId(req), clubId);
  }

  @Post('connect')
  connect(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: ConnectInvoicingDto) {
    requireClubScope(req, clubId);
    return this.service.connect(requireCompanyId(req), clubId, dto.token, dto.voucherType);
  }

  @Patch()
  update(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: UpdateInvoicingDto) {
    requireClubScope(req, clubId);
    return this.service.update(requireCompanyId(req), clubId, dto);
  }

  @Post('payments/:paymentId/issue')
  issue(@Req() req: unknown, @Param('clubId') clubId: string, @Param('paymentId') paymentId: string) {
    requireClubScope(req, clubId);
    return this.service.issueManual(requireCompanyId(req), clubId, paymentId);
  }

  @Post('invoices/:invoiceId/retry')
  retry(@Req() req: unknown, @Param('clubId') clubId: string, @Param('invoiceId') invoiceId: string) {
    requireClubScope(req, clubId);
    return this.service.retry(requireCompanyId(req), clubId, invoiceId);
  }

  @Delete()
  disconnect(@Req() req: unknown, @Param('clubId') clubId: string) {
    requireClubScope(req, clubId);
    return this.service.disconnect(requireCompanyId(req), clubId);
  }
}
