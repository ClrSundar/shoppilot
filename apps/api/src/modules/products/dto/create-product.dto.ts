import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @Type(() => Number)
  @IsNumber()
  costPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  landingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  minimumMarginPercent?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowBelowLandingPrice?: boolean;

  @Type(() => Number)
  @IsNumber()
  sellingPrice: number;

  @IsOptional()
  @IsString()
  taxClassificationCode?: string;

  @IsOptional()
  @IsString()
  taxClassificationLabel?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
