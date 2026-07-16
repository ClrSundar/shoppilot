import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsUUID, Min } from 'class-validator';
import { PaymentDirection, PaymentStatus } from '@prisma/client';

export class ListPaymentsDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsOptional()
  @IsEnum(PaymentDirection)
  direction?: PaymentDirection;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number;
}
