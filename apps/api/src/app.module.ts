import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { FeatureGuard } from './common/guards/feature.guard';
import { InventoryModule } from './modules/inventory/inventory.module';
import { UnifiedBulkUploadModule } from './modules/unified-bulk-upload/unified-bulk-upload.module';
import { AgentsModule } from './modules/agents/agents.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { DecisionModule } from './modules/decisions/decisions.module';
import { TenantSettingsModule } from './modules/tenant-settings/tenant-settings.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { CustomerTypesModule } from './modules/customer-types/customer-types.module';
import { CustomerAccountsModule } from './modules/customer-accounts/customer-accounts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
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
    InventoryModule,
    UnifiedBulkUploadModule,
    AgentsModule,
    CopilotModule,
    DecisionModule,
    TenantSettingsModule,
    PurchasesModule,
    PaymentsModule,
    ReturnsModule,
    SuppliersModule,
    PricingModule,
    CommissionsModule,
    CustomerTypesModule,
    CustomerAccountsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: FeatureGuard,
    },
  ],
})
export class AppModule {}
