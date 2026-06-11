import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

import { Type } from 'class-transformer';

import { CreateQuoteItemDto } from './create-quote-item.dto';

export class CreateQuoteDto {
  @IsString()
  customerId: string;

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => CreateQuoteItemDto)
  items: CreateQuoteItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
