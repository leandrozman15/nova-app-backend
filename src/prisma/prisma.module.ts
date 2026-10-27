import { Global, Module } from '@nestjs/common';

import { PiiBackfillService } from './pii-backfill.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PiiBackfillService],
  exports: [PrismaService],
})
export class PrismaModule {}
