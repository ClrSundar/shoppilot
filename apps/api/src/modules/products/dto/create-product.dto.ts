import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
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

  @Type(() => Number)
  @IsNumber()
  sellingPrice: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
