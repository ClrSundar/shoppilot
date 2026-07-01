import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { Type } from 'class-transformer';

import { CreateQuoteItemDto } from './create-quote-item.dto';

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

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => CreateQuoteItemDto)
  items: CreateQuoteItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
