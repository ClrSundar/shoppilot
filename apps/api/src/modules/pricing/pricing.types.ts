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
  taxClassificationCode: string | null;
  gstRateApplied: number;
  taxableAmount: number;
  taxAmount: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  appliedTaxType: 'NONE' | 'IGST' | 'CGST_SGST' | 'MIXED';
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
  taxPercentage: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalAmount: number;
  sellerStateCode: string | null;
  customerBillingStateCode: string | null;
  placeOfSupplyStateCode: string | null;
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
  | 'placeOfSupplyStateCode'
  | 'notes'
>;
