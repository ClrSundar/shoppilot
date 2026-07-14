import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

export class ReceivePurchaseOrderItemDto {
  @IsUUID()
  purchaseOrderItemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  receivedQuantity: number;
}

export class ReceivePurchaseOrderDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderItemDto)
  items?: ReceivePurchaseOrderItemDto[];

  @IsOptional()
  note?: string;
}
