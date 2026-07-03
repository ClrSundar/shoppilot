import { HttpException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { QuotesService } from '../quotes/quotes.service';

import { WhatsAppWebhookDto } from './dto/whatsapp-webhook.dto';

const defaultMessageRetentionDays = 90;
const defaultConversationRetentionDays = 30;

// ---------------------------------------------------------------------------
// Domain synonym dictionary — keeps product matching language-agnostic
// Keys are canonical tokens; values are alternate words the customer might use.
// ---------------------------------------------------------------------------
const SYNONYMS: Record<string, string[]> = {
  switch: ['switches', 'socket', 'plug', 'modular', 'outlet', 'board'],
  wire: ['wires', 'wiring', 'cable', 'cables', 'conductor', 'flex'],
  fan: ['fans', 'ceiling', 'exhaust', 'ventilation'],
  bulb: ['bulbs', 'led', 'lamp', 'lamps', 'light', 'lights', 'tube', 'batten'],
  pipe: ['pipes', 'conduit', 'piping', 'pvc'],
  mcb: ['breaker', 'circuit', 'miniature', 'db', 'distribution', 'fuse'],
  motor: ['motors', 'pump', 'pumps'],
  tape: ['tapes', 'insulation', 'insulating'],
  coil: ['coils', 'roll', 'rolls'],
  panel: ['panels', 'switchboard', 'board', 'distribution'],
};

// Spoken ordinal/cardinal words mapped to digits
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

type PendingIntent =
  | 'ADD_CUSTOMER'
  | 'ADD_CATEGORY'
  | 'ADD_PRODUCT'
  | 'CREATE_QUOTE'
  | 'CONFIRM_SUGGESTED_QUOTE';

type SuggestedQuoteItem = {
  productId: string;
  productName: string;
  quantity: number;
};

type ConversationState = {
  pendingIntent?: PendingIntent;
  suggestedItems?: SuggestedQuoteItem[];
  suggestedRequirement?: string;
};

type ConversationRecord = {
  id: string;
  state: unknown;
  customerId?: string | null;
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
      customerId?: string | null;
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
      customerId?: string | null;
    };
  }): Promise<unknown>;
  deleteMany(args: {
    where: {
      tenantId: string;
      updatedAt: {
        lt: Date;
      };
    };
  }): Promise<{ count: number }>;
};

type MessageDelegate = {
  create(args: {
    data: {
      tenantId: string;
      conversationId: string;
      customerId?: string | null;
      externalMessageId?: string;
      senderPhone: string;
      messageBody: string;
      direction: 'INBOUND' | 'OUTBOUND';
    };
  }): Promise<unknown>;
  deleteMany(args: {
    where: {
      tenantId: string;
      createdAt: {
        lt: Date;
      };
    };
  }): Promise<{ count: number }>;
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
    let linkedCustomer = await this.findCustomerByPhone(tenant.id, senderPhone);

    const conversationDelegate = this.getConversationDelegate();
    const messageDelegate = this.getMessageDelegate();

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
        customerId: linkedCustomer?.id,
      },
      update: {},
    });

    await messageDelegate.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        customerId: linkedCustomer?.id,
        externalMessageId: payload.messageId,
        senderPhone,
        messageBody: incomingText,
        direction: 'INBOUND',
      },
    });

    const state = this.parseState(conversation.state);

    const lowerText = incomingText.toLowerCase();

    let reply: string;

    try {
      reply = await this.routeMessage(
        tenant.id,
        senderPhone,
        incomingText,
        lowerText,
        state,
      );
    } catch (error) {
      state.pendingIntent = undefined;
      reply = this.getErrorMessage(error);
    }

    const lastIntent = this.mapPendingIntentToEnum(state.pendingIntent);
    linkedCustomer = await this.findCustomerByPhone(tenant.id, senderPhone);

    await conversationDelegate.update({
      where: {
        id: conversation.id,
      },
      data: {
        lastMessage: incomingText,
        lastResponse: reply,
        state,
        lastIntent,
        customerId: linkedCustomer?.id,
      },
    });

    await messageDelegate.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        customerId: linkedCustomer?.id,
        senderPhone,
        messageBody: reply,
        direction: 'OUTBOUND',
      },
    });

    return {
      success: true,
      reply,
    };
  }

  private async routeMessage(
    tenantId: string,
    senderPhone: string,
    incomingText: string,
    lowerText: string,
    state: ConversationState,
  ): Promise<string> {
    if (state.pendingIntent === 'CONFIRM_SUGGESTED_QUOTE') {
      if (lowerText === 'confirm') {
        return this.handleConfirmSuggestedQuote(tenantId, senderPhone, state);
      }

      if (this.isEditCommand(lowerText)) {
        return this.handleSuggestionEdit(tenantId, incomingText, lowerText, state);
      }
    }

    if (lowerText === 'cancel') {
      state.pendingIntent = undefined;
      state.suggestedItems = undefined;
      state.suggestedRequirement = undefined;
      return 'Cancelled current flow. Send "help" to see available commands.';
    }

    if (lowerText === 'help' || lowerText === 'menu') {
      state.pendingIntent = undefined;
      state.suggestedItems = undefined;
      state.suggestedRequirement = undefined;
      return this.helpText();
    }

    const command = this.detectCommand(lowerText, state.pendingIntent);

    if (!command) {
      return this.handleRequirementSuggestion(
        tenantId,
        senderPhone,
        incomingText,
        state,
      );
    }

    const commandPayload = this.stripCommandPrefix(command, incomingText);

    switch (command) {
      case 'ADD_CUSTOMER':
        return this.handleAddCustomer(tenantId, senderPhone, commandPayload, state);
      case 'ADD_CATEGORY':
        return this.handleAddCategory(tenantId, commandPayload, state);
      case 'ADD_PRODUCT':
        return this.handleAddProduct(tenantId, commandPayload, state);
      case 'CREATE_QUOTE':
        return this.handleCreateQuote(tenantId, senderPhone, commandPayload, state);
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
    senderPhone: string,
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
      whatsappNumber: fields.whatsapp ?? senderPhone,
      email: fields.email,
      address: fields.address,
      gstNumber: fields.gst,
    });

    state.pendingIntent = undefined;
    state.suggestedItems = undefined;
    state.suggestedRequirement = undefined;

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
    state.suggestedItems = undefined;
    state.suggestedRequirement = undefined;

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
    state.suggestedItems = undefined;
    state.suggestedRequirement = undefined;

    return `Product created: ${product.name} (${product.id}) in ${category.name}`;
  }

  private async handleCreateQuote(
    tenantId: string,
    senderPhone: string,
    commandPayload: string,
    state: ConversationState,
  ): Promise<string> {
    const fields = this.parseFields(commandPayload);

    const customerQuery = fields.customer;
    const itemsQuery = fields.items;

    if (!itemsQuery) {
      state.pendingIntent = 'CREATE_QUOTE';
      return [
        'To create a quote, send:',
        'create quote customer=Ravi Kumar; items=Anchor Switch 1M*2, Wire Coil*1; notes=Urgent site delivery',
        'If customer is omitted, sender WhatsApp number will be used.',
      ].join('\n');
    }

    const customer = customerQuery
      ? await this.findCustomerByQuery(tenantId, customerQuery)
      : await this.getOrCreateCustomerFromSender(tenantId, senderPhone);

    if (!customer) {
      state.pendingIntent = undefined;
      state.suggestedItems = undefined;
      state.suggestedRequirement = undefined;
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
      state.suggestedItems = undefined;
      state.suggestedRequirement = undefined;
      return `Products not found: ${missingProducts.join(', ')}`;
    }

    const quote = await this.quotesService.create(tenantId, {
      customerId: customer.id,
      items: quoteItems,
      notes: fields.notes,
    });

    state.pendingIntent = undefined;
    state.suggestedItems = undefined;
    state.suggestedRequirement = undefined;

    return [
      `Quote created: ${quote.quoteNumber}`,
      `Customer: ${quote.customer.name}`,
      `Total: ${Number(quote.totalAmount).toFixed(2)}`,
      `Status: ${quote.status}`,
    ].join('\n');
  }

  private async handleRequirementSuggestion(
    tenantId: string,
    senderPhone: string,
    requirementText: string,
    state: ConversationState,
  ): Promise<string> {
    const tokens = this.extractSearchTokens(requirementText);

    if (tokens.length === 0) {
      return `I did not understand that.\n\n${this.helpText()}`;
    }

    const products = await this.prisma.product.findMany({
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
      take: 300,
    });

    const expandedTokens = this.expandWithSynonyms(tokens);
    const quantityMap = this.buildQuantityMap(requirementText);

    const ranked = products
      .map((product) => {
        const productName = product.name.toLowerCase();
        const categoryName = product.category.name.toLowerCase();

        let score = 0;

        for (const token of expandedTokens) {
          if (productName.includes(token)) {
            // Exact word-boundary match scores higher
            score += new RegExp(`\\b${this.escapeRegExp(token)}\\b`).test(productName) ? 5 : 3;
          }

          if (categoryName.includes(token)) {
            score += new RegExp(`\\b${this.escapeRegExp(token)}\\b`).test(categoryName) ? 2 : 1;
          }
        }

        return { product, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (ranked.length === 0) {
      return [
        'I could not match products for this requirement.',
        'Try: create quote items=Product Name*2, Another Product*1',
      ].join('\n');
    }

    const suggestedItems: SuggestedQuoteItem[] = ranked.map(({ product }) => ({
      productId: product.id,
      productName: product.name,
      quantity: this.resolveQuantityForProduct(product.name, tokens, expandedTokens, quantityMap),
    }));

    state.pendingIntent = 'CONFIRM_SUGGESTED_QUOTE';
    state.suggestedItems = suggestedItems;
    state.suggestedRequirement = requirementText;

    const customer = await this.getOrCreateCustomerFromSender(tenantId, senderPhone);

    return `Requirement captured for ${customer.name}.\n${this.buildSuggestionReply(suggestedItems, requirementText)}`;
  }

  private isEditCommand(lowerText: string): boolean {
    return (
      /^remove\s/.test(lowerText) ||
      /^replace\s/.test(lowerText) ||
      /^change\s/.test(lowerText) ||
      /^qty\s/.test(lowerText) ||
      /^add\s/.test(lowerText)
    );
  }

  private async handleSuggestionEdit(
    tenantId: string,
    incomingText: string,
    lowerText: string,
    state: ConversationState,
  ): Promise<string> {
    const items = state.suggestedItems ? [...state.suggestedItems] : [];

    if (items.length === 0) {
      state.pendingIntent = undefined;
      state.suggestedItems = undefined;
      state.suggestedRequirement = undefined;
      return 'No pending suggestions to edit. Please send your requirement again.';
    }

    // --- remove N / remove item N ---
    const removeMatch = lowerText.match(/^remove(?:\s+item)?\s+(\d+)$/);
    if (removeMatch) {
      const idx = parseInt(removeMatch[1], 10) - 1;
      if (idx < 0 || idx >= items.length) {
        return `Invalid item number. Current list has ${items.length} item(s).`;
      }
      items.splice(idx, 1);
      state.suggestedItems = items;
      if (items.length === 0) {
        state.pendingIntent = undefined;
        state.suggestedRequirement = undefined;
        return 'All items removed. Please send your requirement again.';
      }
      return this.buildSuggestionReply(items, state.suggestedRequirement);
    }

    // --- qty N = M / item N qty M / change qty N to M ---
    const qtyPatterns = [
      /^qty\s+(\d+)\s*[=:]\s*(\d+(?:\.\d+)?)$/,
      /^item\s+(\d+)\s+qty\s+(\d+(?:\.\d+)?)$/,
      /^change\s+(?:item\s+)?(\d+)\s+qty\s+(?:to\s+)?(\d+(?:\.\d+)?)$/,
      /^change\s+qty\s+(\d+)\s+to\s+(\d+(?:\.\d+)?)$/,
    ];

    for (const pattern of qtyPatterns) {
      const m = lowerText.match(pattern);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        const newQty = parseFloat(m[2]);
        if (idx < 0 || idx >= items.length) {
          return `Invalid item number. Current list has ${items.length} item(s).`;
        }
        if (!Number.isFinite(newQty) || newQty <= 0) {
          return 'Quantity must be a positive number.';
        }
        items[idx] = { ...items[idx], quantity: newQty };
        state.suggestedItems = items;
        return this.buildSuggestionReply(items, state.suggestedRequirement);
      }
    }

    // --- replace N with <name> / change item N to <name> ---
    const replaceMatch =
      lowerText.match(/^replace\s+(?:item\s+)?(\d+)\s+with\s+(.+)$/) ??
      lowerText.match(/^change\s+item\s+(\d+)\s+to\s+(.+)$/);
    if (replaceMatch) {
      const idx = parseInt(replaceMatch[1], 10) - 1;
      const searchName = incomingText
        .slice(incomingText.toLowerCase().indexOf(replaceMatch[2]))
        .trim();

      if (idx < 0 || idx >= items.length) {
        return `Invalid item number. Current list has ${items.length} item(s).`;
      }

      const product = await this.prisma.product.findFirst({
        where: {
          tenantId,
          active: true,
          name: { contains: searchName, mode: 'insensitive' },
        },
      });

      if (!product) {
        return `Product not found: "${searchName}". Check the name and try again.`;
      }

      items[idx] = {
        productId: product.id,
        productName: product.name,
        quantity: items[idx].quantity,
      };
      state.suggestedItems = items;
      return this.buildSuggestionReply(items, state.suggestedRequirement);
    }

    // --- add <name>*<qty> ---
    const addMatch = incomingText.match(/^add\s+(.+?)\s*[*x]\s*(\d+(?:\.\d+)?)$/i);
    if (addMatch) {
      const searchName = addMatch[1].trim();
      const addQty = parseFloat(addMatch[2]);

      if (!Number.isFinite(addQty) || addQty <= 0) {
        return 'Quantity must be a positive number.';
      }

      const product = await this.prisma.product.findFirst({
        where: {
          tenantId,
          active: true,
          name: { contains: searchName, mode: 'insensitive' },
        },
      });

      if (!product) {
        return `Product not found: "${searchName}". Check the name and try again.`;
      }

      items.push({
        productId: product.id,
        productName: product.name,
        quantity: addQty,
      });
      state.suggestedItems = items;
      return this.buildSuggestionReply(items, state.suggestedRequirement);
    }

    return [
      'Edit command not recognised. Available edits:',
      '  remove 2',
      '  qty 2 = 5',
      '  replace 2 with Finolex Wire',
      '  add Wire Coil*3',
    ].join('\n');
  }

  private buildSuggestionReply(
    items: SuggestedQuoteItem[],
    requirement?: string,
  ): string {
    return [
      requirement ? `Requirement: ${requirement}` : 'Updated suggestions:',
      'Suggested products:',
      ...items.map(
        (item, index) => `${index + 1}) ${item.productName} × ${item.quantity}`,
      ),
      'Reply "confirm" to generate quote.',
      'To adjust: "remove 2", "qty 1 = 5", "replace 2 with Finolex Wire", "add Wire Coil*3"',
    ].join('\n');
  }

  private async handleConfirmSuggestedQuote(
    tenantId: string,
    senderPhone: string,
    state: ConversationState,
  ) {
    const suggestedItems = state.suggestedItems ?? [];

    if (suggestedItems.length === 0) {
      state.pendingIntent = undefined;
      state.suggestedItems = undefined;
      state.suggestedRequirement = undefined;
      return 'No suggested products found. Please send your requirement again.';
    }

    const customer = await this.getOrCreateCustomerFromSender(tenantId, senderPhone);

    const quote = await this.quotesService.create(tenantId, {
      customerId: customer.id,
      items: suggestedItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      notes: state.suggestedRequirement
        ? `WhatsApp requirement: ${state.suggestedRequirement}`
        : 'WhatsApp requirement generated quote',
    });

    state.pendingIntent = undefined;
    state.suggestedItems = undefined;
    state.suggestedRequirement = undefined;

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

    return this.findCustomerByPhone(tenantId, normalizedPhone);
  }

  private async findCustomerByPhone(tenantId: string, normalizedPhone: string) {
    if (!normalizedPhone) {
      return null;
    }

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

  private async getOrCreateCustomerFromSender(
    tenantId: string,
    senderPhone: string,
  ) {
    const existing = await this.findCustomerByPhone(tenantId, senderPhone);

    if (existing) {
      return existing;
    }

    const suffix = senderPhone.slice(-4) || senderPhone;

    return this.customersService.create(tenantId, {
      name: `WhatsApp ${suffix}`,
      phone: senderPhone,
      whatsappNumber: senderPhone,
    });
  }

  async purgeStaleChannelData(tenantId: string) {
    const messageRetentionDays = this.getRetentionDays(
      process.env.WHATSAPP_MESSAGE_RETENTION_DAYS,
      defaultMessageRetentionDays,
    );
    const conversationRetentionDays = this.getRetentionDays(
      process.env.WHATSAPP_CONVERSATION_RETENTION_DAYS,
      defaultConversationRetentionDays,
    );

    const now = Date.now();
    const messageCutoff = new Date(
      now - messageRetentionDays * 24 * 60 * 60 * 1000,
    );
    const conversationCutoff = new Date(
      now - conversationRetentionDays * 24 * 60 * 60 * 1000,
    );

    const messageDelegate = this.getMessageDelegate();

    await messageDelegate.deleteMany({
      where: {
        tenantId,
        createdAt: {
          lt: messageCutoff,
        },
      },
    });

    const conversationDelegate = this.getConversationDelegate();

    await conversationDelegate.deleteMany({
      where: {
        tenantId,
        updatedAt: {
          lt: conversationCutoff,
        },
      },
    });
  }

  private getRetentionDays(value: string | undefined, fallback: number) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
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
      pendingIntent === 'CREATE_QUOTE' ||
      pendingIntent === 'CONFIRM_SUGGESTED_QUOTE'
    ) {
      const suggestedItems = this.parseSuggestedItems(value.suggestedItems);
      const suggestedRequirement =
        typeof value.suggestedRequirement === 'string'
          ? value.suggestedRequirement
          : undefined;

      return {
        pendingIntent,
        suggestedItems,
        suggestedRequirement,
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

  private parseSuggestedItems(value: unknown): SuggestedQuoteItem[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const parsed = value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const row = item as Record<string, unknown>;

        if (
          typeof row.productId !== 'string' ||
          typeof row.productName !== 'string' ||
          typeof row.quantity !== 'number' ||
          !Number.isFinite(row.quantity) ||
          row.quantity <= 0
        ) {
          return null;
        }

        return {
          productId: row.productId,
          productName: row.productName,
          quantity: row.quantity,
        };
      })
      .filter((item): item is SuggestedQuoteItem => item !== null);

    if (parsed.length === 0) {
      return undefined;
    }

    return parsed;
  }

  private extractSearchTokens(text: string): string[] {
    const stopWords = new Set([
      'i', 'need', 'for', 'a', 'an', 'the', 'with', 'and', 'to',
      'quote', 'please', 'want', 'me', 'of', 'in', 'at', 'on',
      'get', 'give', 'send', 'my', 'our', 'some', 'few', 'lot',
    ]);

    // Replace spoken word-numbers with digits so tokens are clean
    let normalised = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    for (const [word, digit] of Object.entries(WORD_NUMBERS)) {
      normalised = normalised.replace(new RegExp(`\\b${word}\\b`, 'g'), String(digit));
    }

    return normalised
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !stopWords.has(t) && !/^\d+$/.test(t));
  }

  // Expand a token set to include all synonyms
  private expandWithSynonyms(tokens: string[]): string[] {
    const expanded = new Set(tokens);
    for (const token of tokens) {
      // Forward: token is a canonical key
      for (const syn of SYNONYMS[token] ?? []) {
        expanded.add(syn);
      }
      // Reverse: token is a synonym value — add the key and all siblings
      for (const [key, values] of Object.entries(SYNONYMS)) {
        if (values.includes(token)) {
          expanded.add(key);
          for (const sibling of values) {
            expanded.add(sibling);
          }
        }
      }
    }
    return Array.from(expanded);
  }

  // Build a map of keyword → quantity extracted from proximity patterns in text
  private buildQuantityMap(requirementText: string): Map<string, number> {
    const map = new Map<string, number>();

    let normalised = requirementText.toLowerCase();

    // Replace word numbers first
    for (const [word, digit] of Object.entries(WORD_NUMBERS)) {
      normalised = normalised.replace(new RegExp(`\\b${word}\\b`, 'g'), String(digit));
    }

    // Pattern: "20 switches" or "20 wire coils"
    const beforePattern = /(\d+(?:\.\d+)?)\s+([a-z][a-z\s]{1,20}?)(?=\s*[,;.!?\n]|$)/g;
    let m: RegExpExecArray | null;
    while ((m = beforePattern.exec(normalised)) !== null) {
      const qty = parseFloat(m[1]);
      const term = m[2].trim();
      if (Number.isFinite(qty) && qty > 0 && term.length >= 2) {
        map.set(term, qty);
        // Also store individual words of multi-word term
        for (const word of term.split(/\s+/)) {
          if (word.length >= 3) {
            map.set(word, qty);
          }
        }
      }
    }

    // Pattern: "switches 20" or "wire coils 5"
    const afterPattern = /([a-z][a-z\s]{1,20}?)\s+(\d+(?:\.\d+)?)(?=\s*[,;.!?\n]|$)/g;
    while ((m = afterPattern.exec(normalised)) !== null) {
      const qty = parseFloat(m[2]);
      const term = m[1].trim();
      if (Number.isFinite(qty) && qty > 0 && term.length >= 2) {
        if (!map.has(term)) {
          map.set(term, qty);
        }
        for (const word of term.split(/\s+/)) {
          if (word.length >= 3 && !map.has(word)) {
            map.set(word, qty);
          }
        }
      }
    }

    return map;
  }

  // Resolve the best quantity for a specific product given the parsed quantity map
  private resolveQuantityForProduct(
    productName: string,
    tokens: string[],
    expandedTokens: string[],
    quantityMap: Map<string, number>,
  ): number {
    const nameLower = productName.toLowerCase();

    // Exact product name in map
    if (quantityMap.has(nameLower)) {
      return quantityMap.get(nameLower)!;
    }

    // Longest matching partial name
    let bestQty: number | undefined;
    let bestMatchLen = 0;
    for (const [term, qty] of quantityMap.entries()) {
      if (nameLower.includes(term) && term.length > bestMatchLen) {
        bestQty = qty;
        bestMatchLen = term.length;
      }
    }
    if (bestQty !== undefined) {
      return bestQty;
    }

    // Fall back to tokens / expanded tokens that hit the quantity map
    for (const token of [...tokens, ...expandedTokens]) {
      if (quantityMap.has(token)) {
        return quantityMap.get(token)!;
      }
    }

    return 1;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      '5) send requirement in plain text, then reply "confirm" to generate quote',
      'Send "cancel" to cancel current flow.',
    ].join('\n');
  }

  private getConversationDelegate(): ConversationDelegate {
    const prismaWithConversation = this.prisma as unknown as {
      whatsAppConversation: ConversationDelegate;
    };

    return prismaWithConversation.whatsAppConversation;
  }

  private getMessageDelegate(): MessageDelegate {
    const prismaWithMessages = this.prisma as unknown as {
      whatsAppMessage: MessageDelegate;
    };

    return prismaWithMessages.whatsAppMessage;
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
