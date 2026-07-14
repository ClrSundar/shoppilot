import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  agentDiscountCategories,
  type AgentDiscountCategory,
} from '../../quotes/dto/create-quote.dto';

export class AgentDiscountConfigItemDto {
  @IsIn(agentDiscountCategories)
  category: AgentDiscountCategory;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultDiscountPercentage: number;
}

export class UpdateAgentDiscountConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AgentDiscountConfigItemDto)
  items: AgentDiscountConfigItemDto[];
}
