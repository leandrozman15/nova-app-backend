import { Global, Module } from '@nestjs/common';

import { FirebaseAdminService } from './firebase-admin.service';
import { MediaStorageService } from './media-storage.service';

@Global()
@Module({
  providers: [FirebaseAdminService, MediaStorageService],
  exports: [FirebaseAdminService, MediaStorageService],
})
export class FirebaseModule {}
