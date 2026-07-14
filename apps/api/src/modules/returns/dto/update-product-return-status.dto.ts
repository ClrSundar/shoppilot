import { ProductReturnStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateProductReturnStatusDto {
  @IsEnum(ProductReturnStatus)
  status: ProductReturnStatus;
}
