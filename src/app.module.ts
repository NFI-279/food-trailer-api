// [Backend] src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'; // <-- 1. Import Throttler
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { SettingsModule } from './settings/settings.module';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    // 2. Configure the Rate Limiter (Limit: 10 requests per 60000ms/1 minute)
    ThrottlerModule.forRoot([{
      ttl: 60000, 
      limit: 10,
    }]),
    PrismaModule,
    MenuModule,
    OrdersModule,
    InventoryModule,
    DashboardModule,
    AuthModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 3. Register the Auth Guard (Our Bouncer)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,   // Bouncer 2: Do you have the right Role?
    },
    // 4. Register the Rate Limiter Guard (Our Anti-Spam Shield)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
