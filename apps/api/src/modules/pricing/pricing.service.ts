import { BadRequestException, Injectable } from '@nestjs/common';
import { DiscountType, UserRole } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  PendingPriceOverrideApproval,
  PricingActor,
  QuoteItemPricingSnapshot,
  QuotePricingInput,
  QuotePricingResult,
} from './pricing.types';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private round2(value: number) {
    return Number(value.toFixed(2));
  }

  private resolveOrderDiscount(
    subtotalAfterLineDiscount: number,
    orderDiscountType: DiscountType | null,
    orderDiscountValue: number | null,
  ) {
    if (!orderDiscountType || orderDiscountValue === null) {
      return 0;
    }

    if (orderDiscountValue < 0) {
      throw new BadRequestException('Order discount value cannot be negative');
    }

    if (orderDiscountType === DiscountType.PERCENTAGE) {
      return this.round2((subtotalAfterLineDiscount * orderDiscountValue) / 100);
    }

    if (orderDiscountType === DiscountType.FIXED_AMOUNT) {
      return this.round2(Math.min(orderDiscountValue, subtotalAfterLineDiscount));
    }

    const fixedPrice = Math.max(orderDiscountValue, 0);

    return this.round2(
      Math.max(subtotalAfterLineDiscount - fixedPrice, 0),
    );
  }

  private resolveManualLineDiscount(
    baseUnitPrice: number,
    quantity: number,
    discountType: DiscountType | undefined,
    discountValue: number | undefined,
  ) {
    if (!discountType || discountValue === undefined) {
      return {
        discountAmount: 0,
        netUnitPrice: baseUnitPrice,
      };
    }

    if (discountValue < 0) {
      throw new BadRequestException('Line discount value cannot be negative');
    }

    const lineBaseAmount = baseUnitPrice * quantity;

    if (discountType === DiscountType.PERCENTAGE) {
      const discountAmount = this.round2((lineBaseAmount * discountValue) / 100);
      const netUnitPrice = this.round2((lineBaseAmount - discountAmount) / quantity);

      return {
        discountAmount,
        netUnitPrice,
      };
    }

    if (discountType === DiscountType.FIXED_AMOUNT) {
      const discountAmount = this.round2(Math.min(discountValue, lineBaseAmount));
      const netUnitPrice = this.round2((lineBaseAmount - discountAmount) / quantity);

      return {
        discountAmount,
        netUnitPrice,
      };
    }

    const fixedUnitPrice = this.round2(Math.max(discountValue, 0));

    if (fixedUnitPrice > baseUnitPrice) {
      throw new BadRequestException(
        'Fixed line price cannot exceed the base line unit price',
      );
    }

    const discountAmount = this.round2((baseUnitPrice - fixedUnitPrice) * quantity);

    return {
      discountAmount,
      netUnitPrice: fixedUnitPrice,
    };
  }

  private getMinimumAllowedSellingPrice(
    landingPrice: number | null,
    minimumMarginPercent: number | null,
  ) {
    if (landingPrice === null) {
      return null;
    }

    const marginPercent = minimumMarginPercent ?? 0;

    return this.round2(landingPrice + (landingPrice * marginPercent) / 100);
  }

  private resolveApprovalStatus(role: UserRole | undefined) {
    if (!role) {
      return 'REQUESTED' as const;
    }

    if (
      role === UserRole.OWNER ||
      role === UserRole.ADMIN ||
      role === UserRole.MANAGER
    ) {
      return 'APPROVED' as const;
    }

    return 'REQUESTED' as const;
  }

  async calculateQuotePricing(
    tenantId: string,
    input: QuotePricingInput,
    actor?: PricingActor,
  ): Promise<QuotePricingResult> {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: input.customerId,
        tenantId,
        active: true,
      },
      include: {
        customerType: {
          select: {
            id: true,
            name: true,
            defaultDiscountPercentage: true,
          },
        },
      },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const customerTypeDiscountPercentage = Number(
      customer.customerType?.defaultDiscountPercentage ?? 0,
    );

    const quoteItems: QuoteItemPricingSnapshot[] = [];
    const pendingApprovals: PendingPriceOverrideApproval[] = [];

    let subtotalBeforeDiscount = 0;
    let lineDiscountAmount = 0;

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];
      const product = await this.prisma.product.findFirst({
        where: {
          id: item.productId,
          tenantId,
          active: true,
        },
      });

      if (!product) {
        throw new BadRequestException(`Product not found: ${item.productId}`);
      }

      const quantity = Number(item.quantity);

      if (quantity <= 0) {
        throw new BadRequestException('Item quantity must be greater than 0');
      }

      const requestedUnitPrice =
        item.unitPrice !== undefined
          ? Number(item.unitPrice)
          : Number(product.sellingPrice);

      const baseUnitPrice = this.round2(requestedUnitPrice);
      subtotalBeforeDiscount += this.round2(baseUnitPrice * quantity);

      const customerTypeDiscountAmount = this.round2(
        ((baseUnitPrice * quantity) * customerTypeDiscountPercentage) / 100,
      );
      const unitPriceAfterCustomerTypeDiscount = this.round2(
        baseUnitPrice - customerTypeDiscountAmount / quantity,
      );

      const manualDiscountType = item.discountType;
      const manualDiscountValue =
        item.discountValue ??
        (item.discountPercentage !== undefined ? item.discountPercentage : undefined);

      const manualLineDiscount = this.resolveManualLineDiscount(
        unitPriceAfterCustomerTypeDiscount,
        quantity,
        manualDiscountType,
        manualDiscountValue,
      );

      const totalLineDiscountAmount = this.round2(
        customerTypeDiscountAmount + manualLineDiscount.discountAmount,
      );
      const netUnitPrice = manualLineDiscount.netUnitPrice;
      const lineTotal = this.round2(netUnitPrice * quantity);

      const discountPercentage =
        baseUnitPrice > 0
          ? this.round2(((baseUnitPrice - netUnitPrice) / baseUnitPrice) * 100)
          : null;

      lineDiscountAmount += totalLineDiscountAmount;

      const minimumAllowedSellingPrice = this.getMinimumAllowedSellingPrice(
        product.landingPrice !== null ? Number(product.landingPrice) : null,
        product.minimumMarginPercent !== null
          ? Number(product.minimumMarginPercent)
          : null,
      );

      if (minimumAllowedSellingPrice !== null && netUnitPrice < minimumAllowedSellingPrice) {
        if (!product.allowBelowLandingPrice) {
          throw new BadRequestException(
            `Price for ${product.name} is below minimum allowed selling price ${minimumAllowedSellingPrice.toFixed(2)}`,
          );
        }

        const reason = item.priceOverrideReason?.trim();

        if (!reason) {
          throw new BadRequestException(
            `Price override reason is required for ${product.name}`,
          );
        }

        if (!actor?.userId) {
          throw new BadRequestException(
            `A signed-in user is required to request price override for ${product.name}`,
          );
        }

        const status = this.resolveApprovalStatus(actor.role);

        if (status === 'REQUESTED') {
          throw new BadRequestException(
            `Price override for ${product.name} requires manager approval`,
          );
        }

        pendingApprovals.push({
          itemIndex: index,
          requestedPrice: netUnitPrice,
          minimumAllowedPrice: minimumAllowedSellingPrice,
          reason,
          requestedById: actor.userId,
          approvedById: actor.userId,
          approvedAt: new Date(),
          status,
        });
      }

      quoteItems.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: netUnitPrice,
        baseUnitPrice,
        discountType:
          totalLineDiscountAmount > 0
            ? (manualDiscountType ?? DiscountType.PERCENTAGE)
            : null,
        discountPercentage,
        discountAmount: totalLineDiscountAmount,
        netUnitPrice,
        lineTotal,
        discountReason: item.discountReason,
      });
    }

    const subtotalAfterLineDiscount = this.round2(
      quoteItems.reduce((sum, item) => sum + item.lineTotal, 0),
    );

    const resolvedOrderDiscountType =
      input.orderDiscountType ??
      (input.discountPercentage !== undefined ? DiscountType.PERCENTAGE : null);
    const resolvedOrderDiscountValue =
      input.orderDiscountValue ?? input.discountPercentage ?? null;

    const orderDiscountAmount = this.resolveOrderDiscount(
      subtotalAfterLineDiscount,
      resolvedOrderDiscountType,
      resolvedOrderDiscountValue,
    );

    const taxableAmount = this.round2(subtotalAfterLineDiscount - orderDiscountAmount);
    const taxAmount = 0;
    const totalAmount = this.round2(taxableAmount + taxAmount);
    const totalDiscountAmount = this.round2(lineDiscountAmount + orderDiscountAmount);

    return {
      quoteItems,
      subtotalBeforeDiscount: this.round2(subtotalBeforeDiscount),
      subtotal: subtotalAfterLineDiscount,
      lineDiscountAmount: this.round2(lineDiscountAmount),
      orderDiscountType: resolvedOrderDiscountType,
      orderDiscountValue: resolvedOrderDiscountValue,
      orderDiscountAmount,
      taxableAmount,
      taxAmount,
      totalAmount,
      totalDiscountAmount,
      pendingApprovals,
      metadata: {
        customerType: customer.customerType
          ? {
              id: customer.customerType.id,
              name: customer.customerType.name,
              defaultDiscountPercentage: customerTypeDiscountPercentage,
            }
          : null,
      },
    };
  }
}
