import { IsOptional, IsUUID } from 'class-validator';

export class InventoryLedgerQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;
}
