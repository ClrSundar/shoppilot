import { HttpException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { QuotesService } from '../quotes/quotes.service';

import { WhatsAppWebhookDto } from './dto/whatsapp-webhook.dto';

type PendingIntent =
  | 'ADD_CUSTOMER'
  | 'ADD_CATEGORY'
  | 'ADD_PRODUCT'
  | 'CREATE_QUOTE';

type ConversationState = {
  pendingIntent?: PendingIntent;
};

type ConversationRecord = {
  id: string;
  state: unknown;
};

type ConversationDelegate = {
  upsert(args: {
    where: {
      tenantId_senderPhone: {
        tenantId: string;
        senderPhone: string;
      };
    };
    create: {
      tenantId: string;
      senderPhone: string;
    };
    update: Record<string, never>;
  }): Promise<ConversationRecord>;
  update(args: {
    where: {
      id: string;
    };
    data: {
      lastMessage: string;
      lastResponse: string;
      state: ConversationState;
      lastIntent: string;
    };
  }): Promise<unknown>;
};

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly categoriesService: CategoriesService,
    private readonly productsService: ProductsService,
    private readonly quotesService: QuotesService,
  ) {}

  async handleIncomingMessage(payload: WhatsAppWebhookDto) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        code: payload.tenantCode,
        active: true,
      },
    });

    if (!tenant) {
      return {
        success: false,
        reply: 'Invalid tenant code. Please contact support.',
      };
    }

    const senderPhone = this.normalizePhone(payload.from);
    const incomingText = payload.message.trim();

    const conversationDelegate = this.getConversationDelegate();

    const conversation = await conversationDelegate.upsert({
      where: {
        tenantId_senderPhone: {
          tenantId: tenant.id,
          senderPhone,
        },
      },
      create: {
        tenantId: tenant.id,
        senderPhone,
      },
      update: {},
    });

    const state = this.parseState(conversation.state);

    const lowerText = incomingText.toLowerCase();

    let reply: string;

    try {
      reply = await this.routeMessage(
        tenant.id,
        incomingText,
        lowerText,
        state,
      );
    } catch (error) {
      state.pendingIntent = undefined;
      reply = this.getErrorMessage(error);
    }

    const lastIntent = this.mapPendingIntentToEnum(state.pendingIntent);

    await conversationDelegate.update({
      where: {
        id: conversation.id,
      },
      data: {
        lastMessage: incomingText,
        lastResponse: reply,
        state,
        lastIntent,
      },
    });

    return {
      success: true,
      reply,
    };
  }

  private async routeMessage(
    tenantId: string,
    incomingText: string,
    lowerText: string,
    state: ConversationState,
  ): Promise<string> {
    if (lowerText === 'cancel') {
      state.pendingIntent = undefined;
      return 'Cancelled current flow. Send "help" to see available commands.';
    }

    if (lowerText === 'help' || lowerText === 'menu') {
      state.pendingIntent = undefined;
      return this.helpText();
    }

    const command = this.detectCommand(lowerText, state.pendingIntent);

    if (!command) {
      return `I did not understand that.\n\n${this.helpText()}`;
    }

    const commandPayload = this.stripCommandPrefix(command, incomingText);

    switch (command) {
      case 'ADD_CUSTOMER':
        return this.handleAddCustomer(tenantId, commandPayload, state);
      case 'ADD_CATEGORY':
        return this.handleAddCategory(tenantId, commandPayload, state);
      case 'ADD_PRODUCT':
        return this.handleAddProduct(tenantId, commandPayload, state);
      case 'CREATE_QUOTE':
        return this.handleCreateQuote(tenantId, commandPayload, state);
      default:
        return this.helpText();
    }
  }

  private detectCommand(
    lowerText: string,
    pendingIntent?: PendingIntent,
  ): PendingIntent | null {
    if (lowerText.startsWith('add customer')) {
      return 'ADD_CUSTOMER';
    }

    if (lowerText.startsWith('add category')) {
      return 'ADD_CATEGORY';
    }

    if (lowerText.startsWith('add product')) {
      return 'ADD_PRODUCT';
    }

    if (
      lowerText.startsWith('create quote') ||
      lowerText.startsWith('generate quote')
    ) {
      return 'CREATE_QUOTE';
    }

    return pendingIntent ?? null;
  }

  private stripCommandPrefix(command: PendingIntent, text: string): string {
    const lowerText = text.toLowerCase();

    if (command === 'ADD_CUSTOMER' && lowerText.startsWith('add customer')) {
      return text.slice('add customer'.length).trim();
    }

    if (command === 'ADD_CATEGORY' && lowerText.startsWith('add category')) {
      return text.slice('add category'.length).trim();
    }

    if (command === 'ADD_PRODUCT' && lowerText.startsWith('add product')) {
      return text.slice('add product'.length).trim();
    }

    if (command === 'CREATE_QUOTE') {
      if (lowerText.startsWith('create quote')) {
        return text.slice('create quote'.length).trim();
      }

      if (lowerText.startsWith('generate quote')) {
        return text.slice('generate quote'.length).trim();
      }
    }

    return text.trim();
  }

  private async handleAddCustomer(
    tenantId: string,
    commandPayload: string,
    state: ConversationState,
  ): Promise<string> {
    const fields = this.parseFields(commandPayload);

    const name = fields.name ?? this.extractSingleValue(commandPayload);

    if (!name) {
      state.pendingIntent = 'ADD_CUSTOMER';
      return [
        'To add a customer, send:',
        'add customer name=Ravi Kumar; phone=9876543210; whatsapp=9876543210; email=ravi@example.com; address=Chennai',
      ].join('\n');
    }

    const customer = await this.customersService.create(tenantId, {
      name,
      phone: fields.phone,
      whatsappNumber: fields.whatsapp,
      email: fields.email,
      address: fields.address,
      gstNumber: fields.gst,
    });

    state.pendingIntent = undefined;

    return `Customer created: ${customer.name} (${customer.id})`;
  }

  private async handleAddCategory(
    tenantId: string,
    commandPayload: string,
    state: ConversationState,
  ): Promise<string> {
    const fields = this.parseFields(commandPayload);
    const name = fields.name ?? this.extractSingleValue(commandPayload);

    if (!name) {
      state.pendingIntent = 'ADD_CATEGORY';
      return [
        'To add a category, send:',
        'add category name=Switches; description=Electrical switches and accessories',
      ].join('\n');
    }

    const category = await this.categoriesService.create(tenantId, {
      name,
      description: fields.description,
    });

    state.pendingIntent = undefined;

    return `Category created: ${category.name} (${category.id})`;
  }

  private async handleAddProduct(
    tenantId: string,
    commandPayload: string,
    state: ConversationState,
  ): Promise<string> {
    const fields = this.parseFields(commandPayload);

    const name = fields.name ?? this.extractSingleValue(commandPayload);
    const categoryName = fields.category;
    const sellingPrice = this.toNumber(fields.selling ?? fields.sellingprice);
    const costPrice =
      this.toNumber(fields.cost ?? fields.costprice) ?? sellingPrice;

    if (!name || !categoryName || sellingPrice === null || costPrice === null) {
      state.pendingIntent = 'ADD_PRODUCT';
      return [
        'To add a product, send:',
        'add product name=Anchor Switch 1M; category=Switches; cost=95; selling=120; unit=NOS; sku=AS-1M',
      ].join('\n');
    }

    const category = await this.prisma.productCategory.findFirst({
      where: {
        tenantId,
        active: true,
        name: {
          equals: categoryName,
          mode: 'insensitive',
        },
      },
    });

    if (!category) {
      state.pendingIntent = undefined;
      return `Category not found: ${categoryName}. Please add the category first.`;
    }

    const product = await this.productsService.create(tenantId, {
      name,
      categoryId: category.id,
      costPrice,
      sellingPrice,
      brand: fields.brand,
      sku: fields.sku,
      unit: fields.unit,
      imageUrl: fields.image,
    });

    state.pendingIntent = undefined;

    return `Product created: ${product.name} (${product.id}) in ${category.name}`;
  }

  private async handleCreateQuote(
    tenantId: string,
    commandPayload: string,
    state: ConversationState,
  ): Promise<string> {
    const fields = this.parseFields(commandPayload);

    const customerQuery = fields.customer;
    const itemsQuery = fields.items;

    if (!customerQuery || !itemsQuery) {
      state.pendingIntent = 'CREATE_QUOTE';
      return [
        'To create a quote, send:',
        'create quote customer=Ravi Kumar; items=Anchor Switch 1M*2, Wire Coil*1; notes=Urgent site delivery',
      ].join('\n');
    }

    const customer = await this.findCustomerByQuery(tenantId, customerQuery);

    if (!customer) {
      state.pendingIntent = undefined;
      return `Customer not found: ${customerQuery}`;
    }

    const parsedItems = this.parseQuoteItems(itemsQuery);

    if (parsedItems.length === 0) {
      state.pendingIntent = 'CREATE_QUOTE';
      return 'No valid items found. Use format: items=Product Name*2, Another Product*1';
    }

    const quoteItems: Array<{ productId: string; quantity: number }> = [];
    const missingProducts: string[] = [];

    for (const item of parsedItems) {
      const product = await this.prisma.product.findFirst({
        where: {
          tenantId,
          active: true,
          name: {
            equals: item.productName,
            mode: 'insensitive',
          },
        },
      });

      if (!product) {
        missingProducts.push(item.productName);
        continue;
      }

      quoteItems.push({
        productId: product.id,
        quantity: item.quantity,
      });
    }

    if (missingProducts.length > 0) {
      state.pendingIntent = undefined;
      return `Products not found: ${missingProducts.join(', ')}`;
    }

    const quote = await this.quotesService.create(tenantId, {
      customerId: customer.id,
      items: quoteItems,
      notes: fields.notes,
    });

    state.pendingIntent = undefined;

    return [
      `Quote created: ${quote.quoteNumber}`,
      `Customer: ${quote.customer.name}`,
      `Total: ${Number(quote.totalAmount).toFixed(2)}`,
      `Status: ${quote.status}`,
    ].join('\n');
  }

  private parseFields(input: string): Record<string, string> {
    if (!input) {
      return {};
    }

    return input
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, part) => {
        const separatorIndex = part.indexOf('=');

        if (separatorIndex <= 0) {
          return acc;
        }

        const key = part.slice(0, separatorIndex).trim().toLowerCase();
        const value = part.slice(separatorIndex + 1).trim();

        if (!key || !value) {
          return acc;
        }

        acc[key] = value;
        return acc;
      }, {});
  }

  private parseQuoteItems(itemsQuery: string) {
    return itemsQuery
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const stars = part.split('*').map((value) => value.trim());

        if (stars.length === 2) {
          const quantity = this.toNumber(stars[1]);

          if (!stars[0] || quantity === null || quantity <= 0) {
            return null;
          }

          return {
            productName: stars[0],
            quantity,
          };
        }

        const match = part.match(/^(.+)\sx\s([0-9]+(\.[0-9]+)?)$/i);

        if (!match) {
          return null;
        }

        const quantity = this.toNumber(match[2]);

        if (quantity === null || quantity <= 0) {
          return null;
        }

        return {
          productName: match[1].trim(),
          quantity,
        };
      })
      .filter((item): item is { productName: string; quantity: number } => {
        return item !== null;
      });
  }

  private async findCustomerByQuery(tenantId: string, query: string) {
    const normalizedQuery = query.trim();

    const byName = await this.prisma.customer.findFirst({
      where: {
        tenantId,
        active: true,
        name: {
          equals: normalizedQuery,
          mode: 'insensitive',
        },
      },
    });

    if (byName) {
      return byName;
    }

    const normalizedPhone = this.normalizePhone(normalizedQuery);

    return this.prisma.customer.findFirst({
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
    });
  }

  private parseState(state: unknown): ConversationState {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return {};
    }

    const value = state as Record<string, unknown>;
    const pendingIntent = value.pendingIntent;

    if (
      pendingIntent === 'ADD_CUSTOMER' ||
      pendingIntent === 'ADD_CATEGORY' ||
      pendingIntent === 'ADD_PRODUCT' ||
      pendingIntent === 'CREATE_QUOTE'
    ) {
      return {
        pendingIntent,
      };
    }

    return {};
  }

  private mapPendingIntentToEnum(intent?: PendingIntent): string {
    if (!intent) {
      return 'NONE';
    }

    if (intent === 'ADD_CUSTOMER') {
      return 'ADD_CUSTOMER';
    }

    if (intent === 'ADD_CATEGORY') {
      return 'ADD_CATEGORY';
    }

    if (intent === 'ADD_PRODUCT') {
      return 'ADD_PRODUCT';
    }

    return 'CREATE_QUOTE';
  }

  private extractSingleValue(payload: string): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (payload.includes('=')) {
      return undefined;
    }

    return payload.trim() || undefined;
  }

  private toNumber(value?: string): number | null {
    if (!value) {
      return null;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  private helpText(): string {
    return [
      'Available commands:',
      '1) add customer name=Ravi Kumar; phone=9876543210; whatsapp=9876543210',
      '2) add category name=Switches; description=Electrical items',
      '3) add product name=Anchor Switch 1M; category=Switches; cost=95; selling=120',
      '4) create quote customer=Ravi Kumar; items=Anchor Switch 1M*2, Wire Coil*1; notes=Urgent',
      'Send "cancel" to cancel current flow.',
    ].join('\n');
  }

  private getConversationDelegate(): ConversationDelegate {
    const prismaWithConversation = this.prisma as unknown as {
      whatsAppConversation: ConversationDelegate;
    };

    return prismaWithConversation.whatsAppConversation;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (typeof response === 'object' && response !== null) {
        const message = (response as { message?: string | string[] }).message;

        if (Array.isArray(message)) {
          return message.join(', ');
        }

        if (typeof message === 'string' && message.trim().length > 0) {
          return message;
        }
      }

      return 'Request failed. Please verify the input and try again.';
    }

    return 'Something went wrong while processing your request.';
  }
}
