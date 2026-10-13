import { Module } from '@nestjs/common';

import { FirebaseModule } from '../firebase/firebase.module';
import { PlatformModule } from '../platform/platform.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FirestoreMigrationService } from './firestore-migration.service';
import {
  DisciplinesController,
  DivisionsController,
  FirestoreMigrationController,
  RosterController,
} from './roster.controller';
import { PhotoMigrationService } from './photo-migration.service';
import { RosterService } from './roster.service';

@Module({
  imports: [PrismaModule, FirebaseModule, PlatformModule],
  controllers: [
    DisciplinesController,
    DivisionsController,
    RosterController,
    FirestoreMigrationController,
  ],
  providers: [RosterService, FirestoreMigrationService, PhotoMigrationService],
  exports: [RosterService, FirestoreMigrationService],
})
export class RosterModule {}
