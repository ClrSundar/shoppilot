import { Module } from '@nestjs/common';

import { CommissionsModule } from '../commissions/commissions.module';
import { PdfModule } from '../pdf/pdf.module';
import { PricingModule } from '../pricing/pricing.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [PdfModule, PricingModule, CommissionsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
