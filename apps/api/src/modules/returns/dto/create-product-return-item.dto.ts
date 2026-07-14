import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateProductReturnItemDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsBoolean()
  restockToInventory?: boolean;
}
