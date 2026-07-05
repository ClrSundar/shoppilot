import { Module } from '@nestjs/common';
import { DecisionController } from './decisions.controller';
import { DecisionService } from './decisions.service';

@Module({
  controllers: [DecisionController],
  providers: [DecisionService],
  exports: [DecisionService],
})
export class DecisionModule {}
