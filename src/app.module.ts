import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { CompanyGuard } from './common/guards/company.guard';
import { FirebaseAuthGuard } from './common/guards/firebase-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { FirebaseModule } from './firebase/firebase.module';
import { FinanceTransactionsModule } from './finance-transactions/finance-transactions.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { HealthModule } from './health/health.module';
import { InjuriesModule } from './injuries/injuries.module';
import { JoinRequestsModule } from './join-requests/join-requests.module';
import { ClubsModule } from './clubs/clubs.module';
import { LeaguesModule } from './leagues/leagues.module';
import { MatchesModule } from './matches/matches.module';
import { MunicipalitiesModule } from './municipalities/municipalities.module';
import { PlayerPaymentsModule } from './player-payments/player-payments.module';
import { PlayersModule } from './players/players.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';
import { StandingsModule } from './standings/standings.module';
import { ShopModule } from './shop/shop.module';
import { TeamsModule } from './teams/teams.module';
import { TrainingSessionsModule } from './training-sessions/training-sessions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite de pedidos para endpoints públicos (se aplica con ThrottlerGuard por controlador).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    PrismaModule,
    FirebaseModule,
    HealthModule,
    UsersModule,
    ClubsModule,
    MunicipalitiesModule,
    LeaguesModule,
    TeamsModule,
    PlayersModule,
    MatchesModule,
    StandingsModule,
    ShopModule,
    FinanceTransactionsModule,
    FacilitiesModule,
    PlayerPaymentsModule,
    TrainingSessionsModule,
    InjuriesModule,
    JoinRequestsModule,
    PublicModule,
    PaymentsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CompanyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
