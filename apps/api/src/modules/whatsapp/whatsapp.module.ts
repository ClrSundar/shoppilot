import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { QuotesModule } from '../quotes/quotes.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [CustomersModule, CategoriesModule, ProductsModule, QuotesModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
