import { Module } from '@nestjs/common';

import { DocStoreModule } from '../docstore/docstore.module';
import {
  AccessControlController,
  MyAccessTokenController,
} from './access-control.controller';
import { AccessControlService } from './access-control.service';

@Module({
  imports: [DocStoreModule],
  controllers: [AccessControlController, MyAccessTokenController],
  providers: [AccessControlService],
})
export class AccessControlModule {}
