import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';
import { ConfirmDraftQuoteDto } from './dto/confirm-draft-quote.dto';
import { PreviousMessageDto } from './dto/copilot-chat.dto';

type CopilotToolCall = {
  tool: string;
  resultSummary: string;
};

type CopilotChatResponse = {
  reply: string;
  toolCalls: CopilotToolCall[];
  requiresConfirmation: boolean;
  draftQuote: DraftQuotePreview | null;
  proposedAction: null | {
    type: string;
    payload: Record<string, unknown>;
  };
};

type DraftQuotePreview = {
  depth: number;
  recommendedHp: string;
  itemCount: number;
  motorSubtotal: number;
  accessorySubtotal: number;
  estimatedTotal: number;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    kind: 'MOTOR' | 'ACCESSORY';
  }>;
};

type MotorRecommendation = {
  id: string;
  name: string;
  price: number;
};

type AccessoryRecommendation = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
};

@Injectable()
export class CopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotesService: QuotesService,
  ) {}

  async chat(
    tenantId: string,
    message: string,
    previousMessages: PreviousMessageDto[] = [],
  ): Promise<CopilotChatResponse> {
    const lowerMessage = message.toLowerCase();

    // --- Context-aware follow-up: affirmative after a borewell/motor response ---
    if (this.isAffirmative(lowerMessage) && previousMessages.length > 0) {
      const lastAssistantText = [...previousMessages]
        .reverse()
        .find((m) => m.role === 'assistant')?.text ?? '';

      if (this.looksLikeBorewellContext(lastAssistantText)) {
        return this.buildDraftQuoteProposal(tenantId, lastAssistantText);
      }
    }

    if (this.looksLikeWriteIntent(lowerMessage)) {
      return {
        reply:
          'I can do that, but write actions are currently confirm-only in this phase. Please ask me to prepare a draft and I will return the exact action payload for confirmation.',
        toolCalls: [],
        requiresConfirmation: true,
        proposedAction: {
          type: 'CONFIRM_REQUIRED',
          payload: {
            originalMessage: message,
          },
        },
        draftQuote: null,
      };
    }

    if (lowerMessage.includes('borewell') || lowerMessage.includes('motor')) {
      return this.handleMotorRecommendation(tenantId, message);
    }

    return this.handleBusinessInsight(tenantId, lowerMessage);
  }

  private isAffirmative(lowerMessage: string): boolean {
    const affirmatives = ['yes', 'yes please', 'sure', 'ok', 'okay', 'proceed', 'go ahead', 'please', 'do it', 'confirm'];
    const trimmed = lowerMessage.trim();
    return affirmatives.some((a) => trimmed === a || trimmed.startsWith(a + ' '));
  }

  private looksLikeBorewellContext(assistantText: string): boolean {
    const lower = assistantText.toLowerCase();
    return (
      lower.includes('borewell') ||
      lower.includes('motor') ||
      lower.includes('submersible') ||
      lower.includes('1.5 hp') ||
      lower.includes('accessories oriented')
    );
  }

  private async buildDraftQuoteProposal(
    tenantId: string,
    lastAssistantText: string,
  ): Promise<CopilotChatResponse> {
    // Pull depth from last assistant text if available
    const depthMatch = lastAssistantText.match(/(\d+(?:\.\d+)?)\s*ft\b/i);
    const depth = depthMatch ? Number(depthMatch[1]) : 320;

    const allProducts = await this.prisma.product.findMany({
      where: { tenantId, active: true },
      include: { category: { select: { name: true } } },
      take: 500,
    });

    const hp = this.recommendedHp(depth);
    const motors = this.selectMotors(allProducts, hp);
    const accessories = this.selectAccessories(allProducts, depth);

    const motorItem = motors[0] ?? null;
    const accessorySubtotal = accessories.reduce((s, i) => s + i.total, 0);
    const motorSubtotal = motorItem?.price ?? 0;
    const grandTotal = accessorySubtotal + motorSubtotal;

    const draftItems: DraftQuotePreview['items'] = [
      ...(motorItem
        ? [
            {
              productId: motorItem.id,
              name: motorItem.name,
              quantity: 1,
              unitPrice: motorItem.price,
              lineTotal: motorItem.price,
              kind: 'MOTOR' as const,
            },
          ]
        : []),
      ...accessories.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        lineTotal: item.total,
        kind: 'ACCESSORY' as const,
      })),
    ];

    const lines: string[] = [
      `Here is the draft quote for a ${depth} ft borewell installation:`,
      '',
    ];

    if (motorItem) {
      lines.push(`Motor: ${motorItem.name} — Rs ${motorItem.price.toFixed(2)}`);
    } else {
      lines.push('Motor: No matching motor found in catalog. Add it manually.');
    }

    if (accessories.length > 0) {
      lines.push('');
      lines.push('Accessories:');
      accessories.forEach((item, i) => {
        lines.push(
          `  ${i + 1}) ${item.name}  x ${item.quantity}  @ Rs ${item.price.toFixed(2)}  = Rs ${item.total.toFixed(2)}`,
        );
      });
      lines.push(`  Accessories subtotal: Rs ${accessorySubtotal.toFixed(2)}`);
    }

    lines.push('');
    lines.push(`Grand Total (est.): Rs ${grandTotal.toFixed(2)}`);
    lines.push('');
    lines.push('To create this as a quote, reply: create quote customer=<Name>');

    return {
      reply: lines.join('\n'),
      toolCalls: [],
      requiresConfirmation: true,
      draftQuote: {
        depth,
        recommendedHp: hp,
        itemCount: draftItems.length,
        motorSubtotal,
        accessorySubtotal,
        estimatedTotal: grandTotal,
        items: draftItems,
      },
      proposedAction: {
        type: 'DRAFT_QUOTE',
        payload: {
          depth,
          motorProductId: motorItem?.id ?? null,
          accessories: accessories.map((a) => ({
            productId: a.id,
            quantity: a.quantity,
          })),
          estimatedTotal: grandTotal,
        },
      },
    };
  }

  async confirmDraftQuote(tenantId: string, dto: ConfirmDraftQuoteDto) {
    const accessories = dto.accessories ?? [];

    const items = [
      ...(dto.motorProductId
        ? [
            {
              productId: dto.motorProductId,
              quantity: 1,
            },
          ]
        : []),
      ...accessories.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    ];

    if (items.length === 0) {
      throw new BadRequestException('No items found in draft quote confirmation');
    }

    const notes = dto.notes?.trim().length
      ? dto.notes
      : [
          'Generated via Copilot draft confirmation',
          dto.depth ? `Depth: ${dto.depth} ft` : null,
          dto.recommendedHp ? `Recommended HP: ${dto.recommendedHp}` : null,
        ]
          .filter(Boolean)
          .join(' | ');

    const quote = await this.quotesService.create(tenantId, {
      customerId: dto.customerId,
      items,
      notes,
    });

    return {
      success: true,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      totalAmount: Number(quote.totalAmount),
      customer: {
        id: quote.customer.id,
        name: quote.customer.name,
      },
    };
  }

  private looksLikeWriteIntent(lowerMessage: string): boolean {
    const writeKeywords = [
      'create quote',
      'generate quote',
      'update quote',
      'delete',
      'remove',
      'approve',
      'cancel quote',
      'mark as',
      'set status',
    ];

    return writeKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  private async handleBusinessInsight(
    tenantId: string,
    lowerMessage: string,
  ): Promise<CopilotChatResponse> {
    const [categories, products, customers, quotes, pendingQuotes, workers] =
      await Promise.all([
        this.prisma.productCategory.count({
          where: { tenantId, active: true },
        }),
        this.prisma.product.count({ where: { tenantId, active: true } }),
        this.prisma.customer.count({ where: { tenantId, active: true } }),
        this.prisma.quote.count({ where: { tenantId } }),
        this.prisma.quote.count({
          where: {
            tenantId,
            status: {
              in: ['DRAFT', 'SENT'],
            },
          },
        }),
        this.prisma.user.count({ where: { tenantId, active: true } }),
      ]);

    const toolCalls: CopilotToolCall[] = [
      {
        tool: 'get_dashboard_metrics',
        resultSummary: `categories=${categories}, products=${products}, customers=${customers}, quotes=${quotes}`,
      },
      {
        tool: 'get_pending_quotes',
        resultSummary: `pending=${pendingQuotes}`,
      },
      {
        tool: 'get_worker_count',
        resultSummary: `workers=${workers}`,
      },
    ];

    if (lowerMessage.includes('pending')) {
      return {
        reply: `You currently have ${pendingQuotes} quotes pending action (DRAFT or SENT).`,
        toolCalls,
        requiresConfirmation: false,
        draftQuote: null,
        proposedAction: null,
      };
    }

    if (lowerMessage.includes('worker') || lowerMessage.includes('team')) {
      return {
        reply: `You currently have ${workers} active team members.`,
        toolCalls,
        requiresConfirmation: false,
        draftQuote: null,
        proposedAction: null,
      };
    }

    return {
      reply: [
        'Here is your live tenant snapshot:',
        `- Categories: ${categories}`,
        `- Products: ${products}`,
        `- Customers: ${customers}`,
        `- Quotes: ${quotes}`,
        `- Pending Quote Actions: ${pendingQuotes}`,
        `- Team Members: ${workers}`,
      ].join('\n'),
      toolCalls,
      requiresConfirmation: false,
      draftQuote: null,
      proposedAction: null,
    };
  }

  private async handleMotorRecommendation(
    tenantId: string,
    message: string,
  ): Promise<CopilotChatResponse> {
    const depth = this.extractDepthInFeet(message);

    if (!depth) {
      return {
        reply:
          'Please share the borewell depth in feet (for example: 320ft) so I can recommend the right motor and accessories.',
        toolCalls: [],
        requiresConfirmation: false,
        draftQuote: null,
        proposedAction: null,
      };
    }

    const hp = this.recommendedHp(depth);

    const allProducts = await this.prisma.product.findMany({
      where: {
        tenantId,
        active: true,
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
      take: 500,
    });

    const motors = this.selectMotors(allProducts, hp);
    const accessories = this.selectAccessories(allProducts, depth);

    const accessorySubtotal = accessories.reduce((sum, item) => sum + item.total, 0);

    const toolCalls: CopilotToolCall[] = [
      {
        tool: 'get_motor_recommendations',
        resultSummary: `depth=${depth}ft, recommended_hp=${hp}, matched_motors=${motors.length}`,
      },
      {
        tool: 'generate_quotation_materials',
        resultSummary: `materials=${accessories.length}, subtotal=${accessorySubtotal.toFixed(2)}`,
      },
    ];

    const motorSection =
      motors.length === 0
        ? 'No direct motor match found in current catalog. Add motor products with HP in the name (for example 1.5 HP Submersible) for precise recommendations.'
        : [
            'Recommended motors from your catalog:',
            ...motors.map(
              (motor, index) =>
                `${index + 1}) ${motor.name} - Rs ${motor.price.toFixed(2)}`,
            ),
          ].join('\n');

    const accessorySection =
      accessories.length === 0
        ? 'No accessory bundle could be prepared from current catalog. Add pipe/cable/panel/fitting items for complete quotation kits.'
        : [
            'Accessories oriented to this installation:',
            ...accessories.map(
              (item, index) =>
                `${index + 1}) ${item.name} x ${item.quantity} @ Rs ${item.price.toFixed(2)} = Rs ${item.total.toFixed(2)}`,
            ),
            `Subtotal (accessories): Rs ${accessorySubtotal.toFixed(2)}`,
          ].join('\n');

    return {
      reply: [
        `For a ${depth} ft borewell, recommended motor capacity is around ${hp}.`,
        motorSection,
        accessorySection,
        'If you want, I can prepare a draft quote payload next for confirmation.',
      ].join('\n\n'),
      toolCalls,
      requiresConfirmation: false,
      draftQuote: null,
      proposedAction: null,
    };
  }

  private extractDepthInFeet(text: string): number | null {
    const normalized = text.toLowerCase();

    const ftMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(ft|feet|foot)/i);

    if (ftMatch) {
      return Number(ftMatch[1]);
    }

    const numberMatch = normalized.match(/(\d+(?:\.\d+)?)/);

    if (!numberMatch) {
      return null;
    }

    const value = Number(numberMatch[1]);

    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return value;
  }

  private recommendedHp(depth: number): string {
    if (depth <= 150) {
      return '1 HP';
    }

    if (depth <= 320) {
      return '1.5 HP';
    }

    if (depth <= 500) {
      return '2 HP';
    }

    return '3 HP';
  }

  private selectMotors(products: any[], hp: string): MotorRecommendation[] {
    const hpToken = hp.toLowerCase().replace(' ', '');

    return products
      .filter((product) => {
        const haystack = `${product.name} ${product.category?.name ?? ''}`.toLowerCase();

        const isMotor =
          haystack.includes('motor') ||
          haystack.includes('submersible') ||
          haystack.includes('pump');

        const hpMatch = haystack.includes(hp.toLowerCase()) || haystack.includes(hpToken);

        return isMotor && hpMatch;
      })
      .slice(0, 2)
      .map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.sellingPrice),
      }));
  }

  private selectAccessories(products: any[], depth: number): AccessoryRecommendation[] {
    const categories = [
      'pipe',
      'cable',
      'panel',
      'valve',
      'rope',
      'clamp',
      'fitting',
      'kit',
      'capacitor',
    ];

    const lengthBasedTokens = ['pipe', 'cable', 'wire', 'rope'];

    return products
      .filter((product) => {
        const haystack = `${product.name} ${product.category?.name ?? ''}`.toLowerCase();
        return categories.some((token) => haystack.includes(token));
      })
      .slice(0, 8)
      .map((product) => {
        const haystack = `${product.name} ${product.category?.name ?? ''}`.toLowerCase();
        const quantity = lengthBasedTokens.some((token) => haystack.includes(token))
          ? depth
          : 1;

        const price = Number(product.sellingPrice);

        return {
          id: product.id,
          name: product.name,
          price,
          quantity,
          total: price * quantity,
        };
      });
  }
}
