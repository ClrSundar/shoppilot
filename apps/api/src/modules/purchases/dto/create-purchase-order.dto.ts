import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { CreatePurchaseItemDto } from './create-purchase-item.dto';

export class CreatePurchaseOrderDto {
  @IsString()
  supplierName: string;

  @IsOptional()
  @IsString()
  supplierPhone?: string;

  @IsOptional()
  @IsEmail()
  supplierEmail?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Z]{15}$/)
  supplierGstNumber?: string;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  taxPercentage?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items: CreatePurchaseItemDto[];
}
