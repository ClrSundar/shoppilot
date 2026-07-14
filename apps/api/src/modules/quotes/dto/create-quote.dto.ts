import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { Type } from 'class-transformer';

import { CreateQuoteItemDto } from './create-quote-item.dto';

export const agentDiscountCategories = [
  'ENGINEER',
  'EXISTING_CUSTOMER',
  'DEALER',
  'CONTRACTOR',
  'OTHER',
] as const;

export type AgentDiscountCategory = (typeof agentDiscountCategories)[number];

export class CreateQuoteDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  agentCommissionPercentage?: number;

  @IsOptional()
  @IsIn(agentDiscountCategories)
  agentCategory?: AgentDiscountCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => CreateQuoteItemDto)
  items: CreateQuoteItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  recommendationRunId?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
