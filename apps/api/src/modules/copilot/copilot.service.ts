import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';
import { ConfirmDraftQuoteDto } from './dto/confirm-draft-quote.dto';
import { PreviousMessageDto } from './dto/copilot-chat.dto';

type CopilotToolCall = {
  tool: string;
  resultSummary: string;
};

type CopilotChatResponse = {
  sessionId: string;
  reply: string;
  toolCalls: CopilotToolCall[];
  requiresConfirmation: boolean;
  confirmationToken?: string;
  draftQuote: DraftQuotePreview | null;
  proposedAction: null | {
    type: string;
    payload: Record<string, unknown>;
  };
};

type DraftQuotePreview = {
  depth: number;
  recommendedHp: string;
  suggestedCustomerId?: string;
  suggestedCustomerName?: string;
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
    userId: string,
    message: string,
    sessionId: string | undefined,
    previousMessages: PreviousMessageDto[] = [],
  ): Promise<CopilotChatResponse> {
    const activeSessionId = sessionId?.trim().length
      ? sessionId.trim()
      : this.generateSessionId();

    const session = await this.getOrCreateSession(tenantId, userId, activeSessionId);

    const lowerMessage = message.toLowerCase();

    // --- Context-aware follow-up: affirmative after a borewell/motor response ---
    if (this.isAffirmative(lowerMessage) && previousMessages.length > 0) {
      const lastAssistantText = [...previousMessages]
        .reverse()
        .find((m) => m.role === 'assistant')?.text ?? '';

      if (this.looksLikeBorewellContext(lastAssistantText)) {
        const response = await this.buildDraftQuoteProposal(
          tenantId,
          userId,
          session.id,
          lastAssistantText,
          previousMessages,
        );

        await this.persistTurn(
          session.id,
          tenantId,
          userId,
          message,
          response,
        );

        return {
          ...response,
          sessionId: activeSessionId,
        };
      }
    }

    if (this.looksLikeWriteIntent(lowerMessage)) {
      const response = {
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

      await this.persistTurn(session.id, tenantId, userId, message, response);

      return {
        ...response,
        sessionId: activeSessionId,
      };
    }

    if (lowerMessage.includes('borewell') || lowerMessage.includes('motor')) {
      const response = await this.handleMotorRecommendation(
        tenantId,
        userId,
        session.id,
        message,
      );

      await this.persistTurn(session.id, tenantId, userId, message, response);

      return {
        ...response,
        sessionId: activeSessionId,
      };
    }

    const response = await this.handleBusinessInsight(tenantId, lowerMessage);

    await this.persistTurn(session.id, tenantId, userId, message, response);

    return {
      ...response,
      sessionId: activeSessionId,
    };
  }

  async getLatestSession(tenantId: string, userId: string) {
    const session = await this.prisma.copilotSession.findFirst({
      where: {
        tenantId,
        userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        sessionId: true,
      },
    });

    if (!session) {
      return {
        sessionId: null,
        messages: [],
      };
    }

    return this.getSessionHistory(tenantId, userId, session.sessionId);
  }

  async getSessionHistory(tenantId: string, userId: string, sessionId: string) {
    const session = await this.prisma.copilotSession.findFirst({
      where: {
        tenantId,
        userId,
        sessionId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!session) {
      return {
        sessionId,
        messages: [],
      };
    }

    return {
      sessionId,
      messages: session.messages.map((message) => ({
        id: message.id,
        role: message.role === 'USER' ? 'user' : 'assistant',
        text: message.text,
        metadata: message.metadata,
        createdAt: message.createdAt,
      })),
    };
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
    userId: string,
    sessionDbId: string,
    lastAssistantText: string,
    previousMessages: PreviousMessageDto[] = [],
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
    const suggestedCustomer = await this.resolveSuggestedCustomer(
      tenantId,
      previousMessages,
    );

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

    const confirmationToken = await this.createDraftConfirmationToken(
      tenantId,
      userId,
      sessionDbId,
      {
        depth,
        recommendedHp: hp,
        suggestedCustomerId: suggestedCustomer?.id ?? null,
        motorProductId: motorItem?.id ?? null,
        accessories: accessories.map((a) => ({
          productId: a.id,
          quantity: a.quantity,
        })),
      },
    );

    return {
      sessionId: '',
      reply: lines.join('\n'),
      toolCalls: [],
      requiresConfirmation: true,
      confirmationToken,
      draftQuote: {
        depth,
        recommendedHp: hp,
        suggestedCustomerId: suggestedCustomer?.id,
        suggestedCustomerName: suggestedCustomer?.name,
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
          recommendedHp: hp,
          suggestedCustomerId: suggestedCustomer?.id ?? null,
          motorProductId: motorItem?.id ?? null,
          accessories: accessories.map((a) => ({
            productId: a.id,
            quantity: a.quantity,
          })),
          estimatedTotal: grandTotal,
          confirmationToken,
        },
      },
    };
  }

  async confirmDraftQuote(tenantId: string, userId: string, dto: ConfirmDraftQuoteDto) {
    const session = await this.prisma.copilotSession.findFirst({
      where: {
        tenantId,
        userId,
        sessionId: dto.sessionId,
      },
      select: {
        id: true,
      },
    });

    if (!session) {
      throw new BadRequestException('Invalid or expired session for draft confirmation');
    }

    const existingByIdempotency = await this.prisma.copilotDraftConfirmation.findUnique({
      where: {
        tenantId_userId_idempotencyKey: {
          tenantId,
          userId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      select: {
        quoteId: true,
      },
    });

    if (existingByIdempotency?.quoteId) {
      const quote = await this.prisma.quote.findFirst({
        where: {
          id: existingByIdempotency.quoteId,
          tenantId,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (quote) {
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
          idempotentReplay: true,
        };
      }
    }

    const confirmation = await this.prisma.copilotDraftConfirmation.findUnique({
      where: {
        token: dto.confirmationToken,
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        sessionDbId: true,
        usedAt: true,
        expiresAt: true,
      },
    });

    if (!confirmation) {
      throw new BadRequestException('Invalid confirmation token');
    }

    if (
      confirmation.tenantId !== tenantId ||
      confirmation.userId !== userId ||
      confirmation.sessionDbId !== session.id
    ) {
      throw new BadRequestException('Confirmation token does not belong to this session');
    }

    if (confirmation.usedAt) {
      throw new BadRequestException('This draft has already been confirmed');
    }

    if (confirmation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Confirmation token expired. Please regenerate draft');
    }

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

    await this.prisma.copilotDraftConfirmation.update({
      where: {
        id: confirmation.id,
      },
      data: {
        usedAt: new Date(),
        idempotencyKey: dto.idempotencyKey,
        quoteId: quote.id,
      },
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
      idempotentReplay: false,
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
        sessionId: '',
        reply: `You currently have ${pendingQuotes} quotes pending action (DRAFT or SENT).`,
        toolCalls,
        requiresConfirmation: false,
        draftQuote: null,
        proposedAction: null,
      };
    }

    if (lowerMessage.includes('worker') || lowerMessage.includes('team')) {
      return {
        sessionId: '',
        reply: `You currently have ${workers} active team members.`,
        toolCalls,
        requiresConfirmation: false,
        draftQuote: null,
        proposedAction: null,
      };
    }

    return {
      sessionId: '',
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
    userId: string,
    sessionDbId: string,
    message: string,
  ): Promise<CopilotChatResponse> {
    const depth = this.extractDepthInFeet(message);

    if (!depth) {
      return {
        sessionId: '',
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
    const suggestedCustomer = await this.resolveSuggestedCustomer(tenantId, []);

    const motorItem = motors[0] ?? null;
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

    const accessorySubtotal = accessories.reduce((sum, item) => sum + item.total, 0);
    const motorSubtotal = motorItem?.price ?? 0;
    const estimatedTotal = Number((motorSubtotal + accessorySubtotal).toFixed(2));

    const confirmationToken = await this.createDraftConfirmationToken(
      tenantId,
      userId,
      sessionDbId,
      {
        depth,
        recommendedHp: hp,
        suggestedCustomerId: suggestedCustomer?.id ?? null,
        motorProductId: motorItem?.id ?? null,
        accessories: accessories.map((a) => ({
          productId: a.id,
          quantity: a.quantity,
        })),
      },
    );

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
      sessionId: '',
      reply: [
        `For a ${depth} ft borewell, recommended motor capacity is around ${hp}.`,
        motorSection,
        accessorySection,
        'If you want, I can prepare a draft quote payload next for confirmation.',
      ].join('\n\n'),
      toolCalls,
      requiresConfirmation: true,
      confirmationToken,
      draftQuote: {
        depth,
        recommendedHp: hp,
        suggestedCustomerId: suggestedCustomer?.id,
        suggestedCustomerName: suggestedCustomer?.name,
        itemCount: draftItems.length,
        motorSubtotal,
        accessorySubtotal,
        estimatedTotal,
        items: draftItems,
      },
      proposedAction: {
        type: 'DRAFT_QUOTE',
        payload: {
          depth,
          recommendedHp: hp,
          suggestedCustomerId: suggestedCustomer?.id ?? null,
          motorProductId: motorItem?.id ?? null,
          accessories: accessories.map((a) => ({
            productId: a.id,
            quantity: a.quantity,
          })),
          estimatedTotal,
          confirmationToken,
        },
      },
    };
  }

  private async getOrCreateSession(
    tenantId: string,
    userId: string,
    sessionId: string,
  ) {
    return this.prisma.copilotSession.upsert({
      where: {
        tenantId_userId_sessionId: {
          tenantId,
          userId,
          sessionId,
        },
      },
      create: {
        tenantId,
        userId,
        sessionId,
      },
      update: {},
    });
  }

  private async persistTurn(
    sessionDbId: string,
    tenantId: string,
    userId: string,
    userMessage: string,
    response: Omit<CopilotChatResponse, 'sessionId'>,
  ) {
    const metadata = {
      requiresConfirmation: response.requiresConfirmation,
      confirmationToken: response.confirmationToken,
      draftQuote: response.draftQuote,
      proposedAction: response.proposedAction,
    } as Prisma.InputJsonValue;

    await this.prisma.$transaction([
      this.prisma.copilotMessage.create({
        data: {
          tenantId,
          userId,
          sessionDbId,
          role: 'USER',
          text: userMessage,
        },
      }),
      this.prisma.copilotMessage.create({
        data: {
          tenantId,
          userId,
          sessionDbId,
          role: 'ASSISTANT',
          text: response.reply,
          metadata,
        },
      }),
      this.prisma.copilotSession.update({
        where: {
          id: sessionDbId,
        },
        data: {
          updatedAt: new Date(),
        },
      }),
    ]);
  }

  private generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async createDraftConfirmationToken(
    tenantId: string,
    userId: string,
    sessionDbId: string,
    draftPayload: Prisma.InputJsonValue,
  ): Promise<string> {
    const token = `cpt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

    await this.prisma.copilotDraftConfirmation.create({
      data: {
        tenantId,
        userId,
        sessionDbId,
        token,
        draftPayload,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    return token;
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

  private async resolveSuggestedCustomer(
    tenantId: string,
    previousMessages: PreviousMessageDto[],
  ) {
    const context = previousMessages
      .filter((message) => message.role === 'user')
      .map((message) => message.text)
      .join(' ');

    // 1) Try phone-based resolution first.
    const phoneMatch = context.match(/\b(?:\+?91[-\s]?)?(\d{10})\b/);

    if (phoneMatch) {
      const normalizedPhone = phoneMatch[1].replace(/[^0-9]/g, '');

      const customerByPhone = await this.prisma.customer.findFirst({
        where: {
          tenantId,
          active: true,
          OR: [
            {
              phone: {
                equals: normalizedPhone,
              },
            },
            {
              whatsappNumber: {
                equals: normalizedPhone,
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (customerByPhone) {
        return customerByPhone;
      }
    }

    // 2) Try explicit customer=Name patterns.
    const customerPattern =
      context.match(/customer\s*=\s*([a-z0-9 .'-]{2,80})/i) ??
      context.match(/for\s+customer\s+([a-z0-9 .'-]{2,80})/i) ??
      context.match(/for\s+([a-z][a-z .'-]{1,80})/i);

    const customerQuery = customerPattern?.[1]?.trim();

    if (customerQuery) {
      const customerByName = await this.prisma.customer.findFirst({
        where: {
          tenantId,
          active: true,
          name: {
            contains: customerQuery,
            mode: 'insensitive',
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (customerByName) {
        return customerByName;
      }
    }

    // 3) Safe fallback: if exactly one active customer exists, use it.
    const activeCustomers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
      take: 2,
    });

    if (activeCustomers.length === 1) {
      return activeCustomers[0];
    }

    return null;
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
