import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import { ClubStoreService } from './club-store.service';
import { CommissionsService } from './commissions.service';
import { MerchantPortalService } from './merchant-portal.service';
import { MerchantsService } from './merchants.service';
import {
  ClubStoreController,
  MerchantInvitationsController,
  MerchantPortalController,
  MyStoreOrdersController,
  PlatformCommissionsController,
  PlatformMerchantsController,
  PublicStoreController,
} from './store.controller';
import { StoreOrdersService } from './store-orders.service';
import { StorePublicService } from './store-public.service';

@Module({
  imports: [PlatformModule],
  controllers: [
    PlatformMerchantsController,
    PlatformCommissionsController,
    MerchantInvitationsController,
    MerchantPortalController,
    ClubStoreController,
    PublicStoreController,
    MyStoreOrdersController,
  ],
  providers: [
    CommissionsService,
    MerchantsService,
    MerchantPortalService,
    StoreOrdersService,
    StorePublicService,
    ClubStoreService,
  ],
})
export class StoreModule {}
