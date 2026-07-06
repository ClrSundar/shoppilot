import { Module } from '@nestjs/common';
import { QuotesModule } from '../quotes/quotes.module';
import { DecisionModule } from '../decisions/decisions.module';

import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';

@Module({
  imports: [QuotesModule, DecisionModule],
  controllers: [CopilotController],
  providers: [CopilotService],
  exports: [CopilotService],
})
export class CopilotModule {}
