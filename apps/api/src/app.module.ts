import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { PlatformAuthModule } from './modules/platform-auth/platform-auth.module';
import { PlatformModule } from './modules/platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    CustomersModule,
    QuotesModule,
    DashboardModule,
    WhatsappModule,
    PlatformAuthModule,
    PlatformModule,
  ],
})
export class AppModule {}
