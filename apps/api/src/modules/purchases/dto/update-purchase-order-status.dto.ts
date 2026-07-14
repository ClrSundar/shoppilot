import { PurchaseOrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePurchaseOrderStatusDto {
  @IsEnum(PurchaseOrderStatus)
  status: PurchaseOrderStatus;
}
