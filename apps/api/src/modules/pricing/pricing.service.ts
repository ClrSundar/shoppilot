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

  private normalizeStateCode(value: string | null | undefined) {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }

  private buildTaxRateMap(gstConfig: unknown) {
    if (!gstConfig || typeof gstConfig !== 'object' || Array.isArray(gstConfig)) {
      return new Map<string, number>();
    }

    const config = gstConfig as Record<string, unknown>;
    const rates = Array.isArray(config.rates) ? config.rates : [];
    const map = new Map<string, number>();

    for (const rateEntry of rates) {
      if (!rateEntry || typeof rateEntry !== 'object' || Array.isArray(rateEntry)) {
        continue;
      }

      const entry = rateEntry as Record<string, unknown>;
      const classificationCodeRaw = entry.classificationCode;
      const percentageRaw = entry.ratePercentage;

      if (typeof classificationCodeRaw !== 'string') {
        continue;
      }

      if (typeof percentageRaw !== 'number' || !Number.isFinite(percentageRaw)) {
        continue;
      }

      const classificationCode = classificationCodeRaw.trim().toUpperCase();
      if (!classificationCode) {
        continue;
      }

      map.set(classificationCode, Number(percentageRaw));
    }

    return map;
  }

  private resolveAppliedTaxType(
    sellerStateCode: string | null,
    placeOfSupplyStateCode: string | null,
  ): 'NONE' | 'IGST' | 'CGST_SGST' {
    if (!sellerStateCode || !placeOfSupplyStateCode) {
      return 'NONE';
    }

    return sellerStateCode === placeOfSupplyStateCode ? 'CGST_SGST' : 'IGST';
  }

  private allocateOrderDiscountByLine(
    lineTaxables: number[],
    orderDiscountAmount: number,
  ) {
    if (lineTaxables.length === 0 || orderDiscountAmount <= 0) {
      return lineTaxables.map(() => 0);
    }

    const subtotalTaxable = this.round2(
      lineTaxables.reduce((sum, value) => sum + value, 0),
    );

    if (subtotalTaxable <= 0) {
      return lineTaxables.map(() => 0);
    }

    const allocations = lineTaxables.map((lineTaxable) =>
      this.round2((lineTaxable / subtotalTaxable) * orderDiscountAmount),
    );

    const allocated = this.round2(
      allocations.reduce((sum, value) => sum + value, 0),
    );
    const residual = this.round2(orderDiscountAmount - allocated);

    if (residual !== 0) {
      let maxIndex = 0;
      for (let index = 1; index < lineTaxables.length; index += 1) {
        if (lineTaxables[index] > lineTaxables[maxIndex]) {
          maxIndex = index;
        }
      }

      allocations[maxIndex] = this.round2(allocations[maxIndex] + residual);
    }

    return allocations;
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

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { gstConfig: true },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const gstConfig =
      tenant?.gstConfig &&
      typeof tenant.gstConfig === 'object' &&
      !Array.isArray(tenant.gstConfig)
        ? (tenant.gstConfig as Record<string, unknown>)
        : {};

    const sellerStateCode = this.normalizeStateCode(
      typeof gstConfig.sellerStateCode === 'string'
        ? gstConfig.sellerStateCode
        : undefined,
    );
    const customerBillingStateCode = this.normalizeStateCode(customer.billingStateCode);
    const placeOfSupplyStateCode = this.normalizeStateCode(
      input.placeOfSupplyStateCode,
    ) ?? customerBillingStateCode;
    const appliedTaxType = this.resolveAppliedTaxType(
      sellerStateCode,
      placeOfSupplyStateCode,
    );
    const taxRateByClassification = this.buildTaxRateMap(gstConfig);

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

      const taxClassificationCode =
        product.taxClassificationCode?.trim().toUpperCase() || null;
      const configuredRate = taxClassificationCode
        ? taxRateByClassification.get(taxClassificationCode)
        : undefined;
      // Backward compatibility: keep existing Product.gstRate as a fallback until fully migrated.
      const fallbackRate = product.gstRate !== null ? Number(product.gstRate) : 0;
      const gstRateApplied =
        configuredRate !== undefined ? this.round2(configuredRate) : this.round2(fallbackRate);

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
        taxClassificationCode,
        gstRateApplied,
        taxableAmount: lineTotal,
        taxAmount: 0,
        igstAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        appliedTaxType,
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

    const lineTaxablesBeforeOrderDiscount = quoteItems.map((item) => item.lineTotal);
    const orderDiscountAllocations = this.allocateOrderDiscountByLine(
      lineTaxablesBeforeOrderDiscount,
      orderDiscountAmount,
    );

    let taxableAmount = 0;
    let taxAmount = 0;
    let igstAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;

    for (let index = 0; index < quoteItems.length; index += 1) {
      const quoteItem = quoteItems[index];
      const allocatedDiscount = orderDiscountAllocations[index] ?? 0;
      const lineTaxable = this.round2(
        Math.max(quoteItem.lineTotal - allocatedDiscount, 0),
      );
      const lineTax = this.round2((lineTaxable * quoteItem.gstRateApplied) / 100);

      let lineIgst = 0;
      let lineCgst = 0;
      let lineSgst = 0;

      if (quoteItem.appliedTaxType === 'IGST') {
        lineIgst = lineTax;
      } else if (quoteItem.appliedTaxType === 'CGST_SGST') {
        lineCgst = this.round2(lineTax / 2);
        lineSgst = this.round2(lineTax - lineCgst);
      }

      quoteItem.taxableAmount = lineTaxable;
      quoteItem.taxAmount = lineTax;
      quoteItem.igstAmount = lineIgst;
      quoteItem.cgstAmount = lineCgst;
      quoteItem.sgstAmount = lineSgst;

      taxableAmount = this.round2(taxableAmount + lineTaxable);
      taxAmount = this.round2(taxAmount + lineTax);
      igstAmount = this.round2(igstAmount + lineIgst);
      cgstAmount = this.round2(cgstAmount + lineCgst);
      sgstAmount = this.round2(sgstAmount + lineSgst);
    }

    const taxPercentage =
      taxableAmount > 0
        ? this.round2((taxAmount / taxableAmount) * 100)
        : 0;

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
      taxPercentage,
      igstAmount,
      cgstAmount,
      sgstAmount,
      totalAmount,
      sellerStateCode,
      customerBillingStateCode,
      placeOfSupplyStateCode,
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
        tax: {
          sellerStateCode,
          customerBillingStateCode,
          placeOfSupplyStateCode,
          appliedTaxType,
        },
      },
    };
  }
}
