import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum RecommendationFeedbackAction {
  ACCEPTED = 'ACCEPTED',
  CHANGED_PRODUCT = 'CHANGED_PRODUCT',
  REJECTED = 'REJECTED',
}

export enum RecommendationFeedbackReason {
  PRICE = 'PRICE',
  STOCK = 'STOCK',
  CUSTOMER_PREFERENCE = 'CUSTOMER_PREFERENCE',
  BRAND_PREFERENCE = 'BRAND_PREFERENCE',
  OTHER = 'OTHER',
}

export class RecommendationFeedbackDto {
  @IsString()
  @IsNotEmpty()
  runId!: string;

  @IsEnum(RecommendationFeedbackAction)
  action!: RecommendationFeedbackAction;

  @IsOptional()
  @IsString()
  selectedAlternativeProductId?: string;

  @IsOptional()
  @IsEnum(RecommendationFeedbackReason)
  reason?: RecommendationFeedbackReason;

  @IsOptional()
  @IsString()
  notes?: string;
}
