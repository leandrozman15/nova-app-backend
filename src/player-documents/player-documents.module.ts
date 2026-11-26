import { Module } from '@nestjs/common';

import { DocStoreModule } from '../docstore/docstore.module';
import {
  GuardianDocumentsController,
  PlayerDocumentsController,
} from './player-documents.controller';
import { PlayerDocumentsService } from './player-documents.service';

@Module({
  imports: [DocStoreModule],
  controllers: [PlayerDocumentsController, GuardianDocumentsController],
  providers: [PlayerDocumentsService],
})
export class PlayerDocumentsModule {}
