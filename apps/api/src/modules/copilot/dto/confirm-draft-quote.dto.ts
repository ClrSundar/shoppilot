import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmDraftQuoteAccessoryDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity!: number;
}

export class ConfirmDraftQuoteDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  confirmationToken!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsOptional()
  @IsString()
  motorProductId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmDraftQuoteAccessoryDto)
  accessories?: ConfirmDraftQuoteAccessoryDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  depth?: number;

  @IsOptional()
  @IsString()
  recommendedHp?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
