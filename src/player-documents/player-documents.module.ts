import { Module } from '@nestjs/common';

import { DocStoreModule } from '../docstore/docstore.module';
import { PlayerDocumentsController } from './player-documents.controller';
import { PlayerDocumentsService } from './player-documents.service';

@Module({
  imports: [DocStoreModule],
  controllers: [PlayerDocumentsController],
  providers: [PlayerDocumentsService],
})
export class PlayerDocumentsModule {}
