import { Global, Module } from '@nestjs/common';

import { ClubInvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';

@Global()
@Module({
  controllers: [ClubInvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
