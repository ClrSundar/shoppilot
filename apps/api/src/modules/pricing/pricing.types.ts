import type { DiscountType, UserRole } from '@prisma/client';

import type { CreateQuoteDto } from '../quotes/dto/create-quote.dto';

export type PricingActor = {
  userId: string;
  role?: UserRole;
};

export type PendingPriceOverrideApproval = {
  itemIndex: number;
  requestedPrice: number;
  minimumAllowedPrice: number;
  reason: string;
  requestedById: string;
  approvedById?: string;
  approvedAt?: Date;
  status: 'REQUESTED' | 'APPROVED';
};

export type QuoteItemPricingSnapshot = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  baseUnitPrice: number;
  discountType: DiscountType | null;
  discountPercentage: number | null;
  discountAmount: number;
  netUnitPrice: number;
  lineTotal: number;
  discountReason?: string;
};

export type QuotePricingResult = {
  quoteItems: QuoteItemPricingSnapshot[];
  subtotalBeforeDiscount: number;
  subtotal: number;
  lineDiscountAmount: number;
  orderDiscountType: DiscountType | null;
  orderDiscountValue: number | null;
  orderDiscountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  totalDiscountAmount: number;
  pendingApprovals: PendingPriceOverrideApproval[];
  metadata: Record<string, unknown>;
};

export type QuotePricingInput = Pick<
  CreateQuoteDto,
  | 'customerId'
  | 'items'
  | 'orderDiscountType'
  | 'orderDiscountValue'
  | 'discountPercentage'
  | 'notes'
>;
