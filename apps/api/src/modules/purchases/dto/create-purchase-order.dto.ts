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
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { CreatePurchaseItemDto } from './create-purchase-item.dto';

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ValidateIf((o) => !o.supplierId)
  @IsString()
  supplierName?: string;

  @ValidateIf((o) => !o.supplierId)
  @IsOptional()
  @IsString()
  supplierPhone?: string;

  @ValidateIf((o) => !o.supplierId)
  @IsOptional()
  @IsEmail()
  supplierEmail?: string;

  @ValidateIf((o) => !o.supplierId)
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
