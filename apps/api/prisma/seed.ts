import {
  PrismaClient,
  AttributeDataType,
  CompatibilityRelationType,
  RequirementType,
  DecisionRuleStatus,
  RecommendationAction,
  RecommendationRunStatus,
  PaymentDirection,
  PaymentMethod,
  PaymentStatus,
  ProductReturnStatus,
  ProductReturnType,
  PurchaseOrderStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ============================================================================
// MASTER DATA — sourced from shoppilot_decision_engine_seed_data.xlsx
// ============================================================================

const CATEGORIES = [
  { name: 'Submersible Motors', description: 'Borewell and submersible motors' },
  { name: 'Motor Starters', description: 'Motor control and protection starters' },
  { name: 'Cables', description: 'Submersible cables and electrical wiring' },
  { name: 'Pipes', description: 'HDPE delivery pipes' },
  { name: 'Safety Accessories', description: 'Safety and installation accessories' },
  { name: 'Valves', description: 'Foot valves and non-return valves' },
];

const PRODUCTS = [
  // Submersible Motors
  {
    name: 'CRI 2HP Single Phase Submersible Motor',
    category: 'Submersible Motors',
    brand: 'CRI',
    sku: 'MOT-CRI-2HP-1P',
    unit: 'NOS',
    costPrice: 18500,
    sellingPrice: 22500,
    mrp: 23500,
    gstRate: 18,
    initialStock: 5,
    description: '2HP single phase submersible motor for borewells up to 250 ft',
    attrs: { HP: 2, HEAD: 250, PHASE: 'SINGLE' },
  },
  {
    name: 'Texmo 2HP Single Phase Submersible Motor',
    category: 'Submersible Motors',
    brand: 'Texmo',
    sku: 'MOT-TEX-2HP-1P',
    unit: 'NOS',
    costPrice: 17500,
    sellingPrice: 21500,
    mrp: 22500,
    gstRate: 18,
    initialStock: 0,
    description: '2HP single phase submersible motor for borewells up to 260 ft',
    attrs: { HP: 2, HEAD: 260, PHASE: 'SINGLE' },
  },
  {
    name: 'CRI 3HP Single Phase Submersible Motor',
    category: 'Submersible Motors',
    brand: 'CRI',
    sku: 'MOT-CRI-3HP-1P',
    unit: 'NOS',
    costPrice: 25500,
    sellingPrice: 31500,
    mrp: 32500,
    gstRate: 18,
    initialStock: 8,
    description: '3HP single phase submersible motor for borewells up to 350 ft',
    attrs: { HP: 3, HEAD: 350, PHASE: 'SINGLE' },
  },
  {
    name: 'Texmo 3HP Single Phase Submersible Motor',
    category: 'Submersible Motors',
    brand: 'Texmo',
    sku: 'MOT-TEX-3HP-1P',
    unit: 'NOS',
    costPrice: 24500,
    sellingPrice: 30500,
    mrp: 31500,
    gstRate: 18,
    initialStock: 15,
    description: '3HP single phase submersible motor for borewells up to 340 ft',
    attrs: { HP: 3, HEAD: 340, PHASE: 'SINGLE' },
  },
  {
    name: 'Kirloskar 3HP Single Phase Submersible Motor',
    category: 'Submersible Motors',
    brand: 'Kirloskar',
    sku: 'MOT-KIR-3HP-1P',
    unit: 'NOS',
    costPrice: 27000,
    sellingPrice: 33500,
    mrp: 34500,
    gstRate: 18,
    initialStock: 2,
    description: '3HP single phase submersible motor for borewells up to 360 ft',
    attrs: { HP: 3, HEAD: 360, PHASE: 'SINGLE' },
  },
  {
    name: 'CRI 5HP Three Phase Submersible Motor',
    category: 'Submersible Motors',
    brand: 'CRI',
    sku: 'MOT-CRI-5HP-3P',
    unit: 'NOS',
    costPrice: 42000,
    sellingPrice: 52000,
    mrp: 53500,
    gstRate: 18,
    initialStock: 3,
    description: '5HP three phase submersible motor for borewells up to 550 ft',
    attrs: { HP: 5, HEAD: 550, PHASE: 'THREE' },
  },
  // Motor Starters
  {
    name: '3HP Single Phase Motor Starter',
    category: 'Motor Starters',
    brand: 'L&T',
    sku: 'STR-3HP-1P',
    unit: 'NOS',
    costPrice: 3500,
    sellingPrice: 4500,
    mrp: 5000,
    gstRate: 18,
    initialStock: 20,
    description: 'Starter for 3HP single phase submersible motors',
    attrs: {},
  },
  {
    name: '5HP Three Phase Motor Starter',
    category: 'Motor Starters',
    brand: 'L&T',
    sku: 'STR-5HP-3P',
    unit: 'NOS',
    costPrice: 6000,
    sellingPrice: 7500,
    mrp: 8500,
    gstRate: 18,
    initialStock: 10,
    description: 'Starter for 5HP three phase submersible motors',
    attrs: {},
  },
  // Cables
  {
    name: '4 sqmm Submersible Cable',
    category: 'Cables',
    brand: 'Polycab',
    sku: 'CAB-4SQMM',
    unit: 'MTR',
    costPrice: 70,
    sellingPrice: 95,
    mrp: 110,
    gstRate: 18,
    initialStock: 500,
    description: '4 sqmm copper submersible cable',
    attrs: { CABLE_SIZE: 4 },
  },
  {
    name: '6 sqmm Submersible Cable',
    category: 'Cables',
    brand: 'Polycab',
    sku: 'CAB-6SQMM',
    unit: 'MTR',
    costPrice: 110,
    sellingPrice: 145,
    mrp: 165,
    gstRate: 18,
    initialStock: 300,
    description: '6 sqmm copper submersible cable',
    attrs: { CABLE_SIZE: 6 },
  },
  // Pipes
  {
    name: '32mm HDPE Pipe',
    category: 'Pipes',
    brand: 'Supreme',
    sku: 'PIP-HDPE-32',
    unit: 'MTR',
    costPrice: 48,
    sellingPrice: 68,
    mrp: 75,
    gstRate: 18,
    initialStock: 300,
    description: '32mm HDPE pipe for borewell delivery line',
    attrs: { PIPE_SIZE: 32 },
  },
  {
    name: '40mm HDPE Pipe',
    category: 'Pipes',
    brand: 'Supreme',
    sku: 'PIP-HDPE-40',
    unit: 'MTR',
    costPrice: 68,
    sellingPrice: 95,
    mrp: 105,
    gstRate: 18,
    initialStock: 200,
    description: '40mm HDPE pipe for borewell delivery line',
    attrs: { PIPE_SIZE: 40 },
  },
  // Safety Accessories
  {
    name: 'Nylon Safety Rope',
    category: 'Safety Accessories',
    brand: 'Generic',
    sku: 'ROP-NYLON',
    unit: 'MTR',
    costPrice: 10,
    sellingPrice: 18,
    mrp: 25,
    gstRate: 18,
    initialStock: 1000,
    description: 'Nylon safety rope for securing submersible pumps',
    attrs: {},
  },
  // Valves
  {
    name: 'Brass Foot Valve',
    category: 'Valves',
    brand: 'Generic',
    sku: 'VAL-FOOT-BRASS',
    unit: 'NOS',
    costPrice: 600,
    sellingPrice: 850,
    mrp: 1000,
    gstRate: 18,
    initialStock: 25,
    description: 'Brass foot valve for borewell pump setup',
    attrs: {},
  },
  {
    name: 'Non Return Valve',
    category: 'Valves',
    brand: 'Generic',
    sku: 'VAL-NRV',
    unit: 'NOS',
    costPrice: 850,
    sellingPrice: 1200,
    mrp: 1400,
    gstRate: 18,
    initialStock: 20,
    description: 'Non return valve for borewell pump setup',
    attrs: {},
  },
];

const COMPATIBILITY = [
  { sourceSku: 'MOT-CRI-3HP-1P', relationType: 'REQUIRED_WITH', targetSku: 'STR-3HP-1P', priority: 1, reason: 'Protects 3HP single phase motor from overload and dry run' },
  { sourceSku: 'MOT-CRI-3HP-1P', relationType: 'RECOMMENDED_WITH', targetSku: 'ROP-NYLON', priority: 2, reason: 'Prevents accidental pump fall during installation and service' },
  { sourceSku: 'MOT-CRI-3HP-1P', relationType: 'RECOMMENDED_WITH', targetSku: 'CAB-4SQMM', priority: 2, reason: 'Suitable cable size for typical 3HP single phase installation' },
  { sourceSku: 'MOT-TEX-3HP-1P', relationType: 'REQUIRED_WITH', targetSku: 'STR-3HP-1P', priority: 1, reason: 'Protects 3HP single phase motor from overload and dry run' },
  { sourceSku: 'MOT-TEX-3HP-1P', relationType: 'RECOMMENDED_WITH', targetSku: 'ROP-NYLON', priority: 2, reason: 'Prevents accidental pump fall during installation and service' },
  { sourceSku: 'MOT-TEX-3HP-1P', relationType: 'RECOMMENDED_WITH', targetSku: 'CAB-4SQMM', priority: 2, reason: 'Suitable cable size for typical 3HP single phase installation' },
  { sourceSku: 'MOT-KIR-3HP-1P', relationType: 'REQUIRED_WITH', targetSku: 'STR-3HP-1P', priority: 1, reason: 'Protects 3HP single phase motor from overload and dry run' },
  { sourceSku: 'MOT-KIR-3HP-1P', relationType: 'RECOMMENDED_WITH', targetSku: 'ROP-NYLON', priority: 2, reason: 'Prevents accidental pump fall during installation and service' },
  { sourceSku: 'MOT-CRI-5HP-3P', relationType: 'REQUIRED_WITH', targetSku: 'STR-5HP-3P', priority: 1, reason: 'Provides control and overload protection for 5HP three phase motor' },
  { sourceSku: 'MOT-CRI-5HP-3P', relationType: 'RECOMMENDED_WITH', targetSku: 'CAB-6SQMM', priority: 2, reason: 'Appropriate cable size for higher-load 5HP installation' },
  { sourceSku: 'MOT-CRI-2HP-1P', relationType: 'RECOMMENDED_WITH', targetSku: 'ROP-NYLON', priority: 2, reason: 'Prevents accidental pump fall during installation and service' },
  { sourceSku: 'MOT-TEX-2HP-1P', relationType: 'RECOMMENDED_WITH', targetSku: 'ROP-NYLON', priority: 2, reason: 'Prevents accidental pump fall during installation and service' },
];

// Solution templates: templateCode → list of items
const SOLUTION_TEMPLATES = [
  {
    code: 'BOREWELL_STANDARD_2HP',
    name: 'Borewell Standard 2HP',
    purpose: 'Complete solution for 2HP single phase borewell up to 280 ft',
    items: [
      { sku: 'MOT-CRI-2HP-1P', requirementType: 'REQUIRED', qty: 1, reason: 'Primary motor; engine ranks CRI and Texmo 2HP alternatives.' },
      { sku: 'ROP-NYLON', requirementType: 'RECOMMENDED', qty: 2, reason: 'Secures the motor during installation and servicing.' },
      { sku: 'VAL-FOOT-BRASS', requirementType: 'OPTIONAL', qty: 1, reason: 'Helps retain water and reduce priming issues where applicable.' },
    ],
  },
  {
    code: 'BOREWELL_STANDARD_3HP',
    name: 'Borewell Standard 3HP',
    purpose: 'Complete solution for 3HP single phase borewell 300–360 ft',
    items: [
      { sku: 'MOT-CRI-3HP-1P', requirementType: 'REQUIRED', qty: 1, reason: 'Primary motor; engine ranks all 3HP single phase alternatives.' },
      { sku: 'STR-3HP-1P', requirementType: 'REQUIRED', qty: 1, reason: 'Protects the motor from overload and dry run.' },
      { sku: 'CAB-4SQMM', requirementType: 'RECOMMENDED', qty: 100, reason: 'Cable length must be adjusted to actual installation depth.' },
      { sku: 'ROP-NYLON', requirementType: 'RECOMMENDED', qty: 2, reason: 'Secures the motor during installation and servicing.' },
      { sku: 'PIP-HDPE-32', requirementType: 'RECOMMENDED', qty: 100, reason: 'Pipe length must be adjusted to actual installation depth.' },
      { sku: 'VAL-NRV', requirementType: 'OPTIONAL', qty: 1, reason: 'Prevents reverse water flow after pump stops.' },
    ],
  },
  {
    code: 'BOREWELL_STANDARD_5HP',
    name: 'Borewell Standard 5HP',
    purpose: 'Complete solution for 5HP three phase borewell 400–550 ft',
    items: [
      { sku: 'MOT-CRI-5HP-3P', requirementType: 'REQUIRED', qty: 1, reason: 'Primary motor for higher head and three phase supply.' },
      { sku: 'STR-5HP-3P', requirementType: 'REQUIRED', qty: 1, reason: 'Provides control and overload protection.' },
      { sku: 'CAB-6SQMM', requirementType: 'RECOMMENDED', qty: 100, reason: 'Cable length must be adjusted to actual installation depth.' },
      { sku: 'ROP-NYLON', requirementType: 'RECOMMENDED', qty: 2, reason: 'Secures the motor during installation and servicing.' },
      { sku: 'PIP-HDPE-40', requirementType: 'RECOMMENDED', qty: 100, reason: 'Pipe length must be adjusted to actual installation depth.' },
    ],
  },
];

// Decision rules: conditions use boreDepthFt + phase to match the query API
const DECISION_RULES = [
  {
    code: 'BORE_WELL_200_280_SINGLE',
    name: 'Borewell 200–280 ft Single Phase → 2HP',
    description: 'For a 200–280 ft borewell with single phase supply, recommend a 2HP submersible motor.',
    priority: 10,
    version: 1,
    status: 'ACTIVE',
    conditions: { boreDepthFt: { min: 200, max: 280 }, phase: 'SINGLE' },
    templateCode: 'BOREWELL_STANDARD_2HP',
  },
  {
    code: 'BORE_WELL_300_360_SINGLE',
    name: 'Borewell 300–360 ft Single Phase → 3HP',
    description: 'For a 300–360 ft borewell with single phase supply, recommend a 3HP submersible motor.',
    priority: 10,
    version: 1,
    status: 'ACTIVE',
    conditions: { boreDepthFt: { min: 300, max: 360 }, phase: 'SINGLE' },
    templateCode: 'BOREWELL_STANDARD_3HP',
  },
  {
    code: 'BORE_WELL_400_550_THREE',
    name: 'Borewell 400–550 ft Three Phase → 5HP',
    description: 'For a 400–550 ft borewell with three phase supply, recommend a 5HP submersible motor.',
    priority: 10,
    version: 1,
    status: 'ACTIVE',
    conditions: { boreDepthFt: { min: 400, max: 550 }, phase: 'THREE' },
    templateCode: 'BOREWELL_STANDARD_5HP',
  },
];

// ============================================================================
// STEP 0a — ENSURE DEMO TENANT + OWNER USER EXIST
// ============================================================================

async function ensureDemoTenant() {
  let tenant = await prisma.tenant.findFirst();

  if (!tenant) {
    console.log('🏪 No tenant found — creating demo tenant...');
    tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Borewell Shop',
        code: 'DEMO',
        businessType: 'GENERAL',
        active: true,
        status: 'ACTIVE',
      },
    });

    const passwordHash = await bcrypt.hash('Demo@1234', 10);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: 'Demo Owner',
        email: 'owner@demo.com',
        password: passwordHash,
        role: UserRole.OWNER,
        active: true,
      },
    });

    console.log(`  ✅ Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`  ✅ Owner user: owner@demo.com / Demo@1234`);
  } else {
    console.log(`🏪 Using existing tenant: ${tenant.name} (${tenant.id})`);
  }

  return tenant;
}

// ============================================================================
// STEP 0b — CLEAR EXISTING DECISION + PRODUCT DATA
// Keeps: Tenant, User, Customer, Agent, Quote, WhatsApp, Subscription, etc.
// ============================================================================

async function clearData() {
  console.log('🗑️  Clearing existing decision + product data...');

  // Child tables first to respect FK constraints
  await prisma.productReturnItem.deleteMany();
  await prisma.productReturn.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.recommendationFeedback.deleteMany();
  await prisma.recommendationCandidate.deleteMany();
  await prisma.recommendationRun.deleteMany();
  await prisma.solutionTemplateItem.deleteMany();
  await prisma.solutionTemplate.deleteMany();
  await prisma.decisionRule.deleteMany();
  await prisma.productCompatibility.deleteMany();
  await prisma.productAttributeValue.deleteMany();
  await prisma.inventoryLedgerEntry.deleteMany();
  await prisma.inventoryStock.deleteMany();
  // Delete quote items before products (FK)
  await prisma.quoteItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.attributeDefinition.deleteMany();

  console.log('✅ Data cleared.\n');
}

// ============================================================================
// STEP 1 — ATTRIBUTE DEFINITIONS (platform-wide, no tenantId)
// ============================================================================

async function seedAttributeDefinitions() {
  console.log('🏷️  Seeding attribute definitions...');

  const defs = [
    { code: 'HP', name: 'Horsepower', dataType: AttributeDataType.NUMBER, unit: 'hp', description: 'Motor horsepower rating' },
    { code: 'HEAD', name: 'Total Head', dataType: AttributeDataType.NUMBER, unit: 'feet', description: 'Maximum discharge head' },
    { code: 'PHASE', name: 'Phase', dataType: AttributeDataType.SELECT, allowedValues: JSON.stringify(['SINGLE', 'THREE']), description: 'Electrical phase' },
    { code: 'CABLE_SIZE', name: 'Cable Size', dataType: AttributeDataType.NUMBER, unit: 'sqmm', description: 'Cable cross-sectional area' },
    { code: 'PIPE_SIZE', name: 'Pipe Size', dataType: AttributeDataType.NUMBER, unit: 'mm', description: 'Pipe outer diameter' },
  ];

  const map: Record<string, string> = {};
  for (const d of defs) {
    const attr = await prisma.attributeDefinition.create({ data: { ...d, active: true } });
    map[d.code] = attr.id;
    console.log(`  ✅ ${d.code}`);
  }
  return map;
}

// ============================================================================
// STEP 2 — CATEGORIES (tenant-scoped)
// ============================================================================

async function seedCategories(tenantId: string) {
  console.log('\n📂 Seeding categories...');
  const map: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const cat = await prisma.productCategory.create({
      data: { tenantId, name: c.name, description: c.description, active: true },
    });
    map[c.name] = cat.id;
    console.log(`  ✅ ${c.name}`);
  }
  return map;
}

// ============================================================================
// STEP 3 — PRODUCTS + ATTRIBUTE VALUES + INVENTORY
// ============================================================================

async function seedProducts(
  tenantId: string,
  categoryMap: Record<string, string>,
  attrMap: Record<string, string>,
) {
  console.log('\n📦 Seeding products...');
  const skuMap: Record<string, string> = {};

  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        tenantId,
        categoryId: categoryMap[p.category],
        name: p.name,
        sku: p.sku,
        brand: p.brand,
        description: p.description,
        unit: p.unit,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        gstRate: p.gstRate,
        active: true,
      },
    });
    skuMap[p.sku] = product.id;

    // Attribute values
    for (const [code, value] of Object.entries(p.attrs)) {
      const attrDefId = attrMap[code];
      if (!attrDefId) continue;
      await prisma.productAttributeValue.create({
        data: {
          productId: product.id,
          attributeDefinitionId: attrDefId,
          ...(typeof value === 'number'
            ? { valueNumber: value }
            : { valueText: String(value) }),
        },
      });
    }

    // Initial inventory stock
    if (p.initialStock > 0) {
      await prisma.inventoryStock.create({
        data: {
          tenantId,
          productId: product.id,
          onHand: p.initialStock,
          reserved: 0,
          reorderLevel: 2,
          active: true,
        },
      });
    } else {
      // Create zero-stock record so the product appears in inventory
      await prisma.inventoryStock.create({
        data: {
          tenantId,
          productId: product.id,
          onHand: 0,
          reserved: 0,
          reorderLevel: 2,
          active: true,
        },
      });
    }

    console.log(`  ✅ ${p.sku} — ${p.name} (stock: ${p.initialStock})`);
  }

  return skuMap;
}

// ============================================================================
// STEP 4 — COMPATIBILITY RULES
// ============================================================================

async function seedCompatibility(tenantId: string, skuMap: Record<string, string>) {
  console.log('\n🔗 Seeding compatibility rules...');

  for (const c of COMPATIBILITY) {
    const sourceId = skuMap[c.sourceSku];
    const targetId = skuMap[c.targetSku];
    if (!sourceId || !targetId) {
      console.warn(`  ⚠️  Skipping ${c.sourceSku} → ${c.targetSku} (product not found)`);
      continue;
    }
    await prisma.productCompatibility.create({
      data: {
        tenantId,
        sourceProductId: sourceId,
        targetProductId: targetId,
        relationType: c.relationType as CompatibilityRelationType,
        reason: c.reason,
        priority: c.priority,
        active: true,
      },
    });
    console.log(`  ✅ ${c.sourceSku} ${c.relationType} ${c.targetSku}`);
  }
}

// ============================================================================
// STEP 5 — SOLUTION TEMPLATES + ITEMS
// ============================================================================

async function seedSolutionTemplates(tenantId: string, skuMap: Record<string, string>) {
  console.log('\n📋 Seeding solution templates...');
  const templateMap: Record<string, string> = {};

  for (const t of SOLUTION_TEMPLATES) {
    const template = await prisma.solutionTemplate.create({
      data: {
        tenantId,
        code: t.code,
        name: t.name,
        purpose: t.purpose,
        active: true,
      },
    });
    templateMap[t.code] = template.id;
    console.log(`  ✅ ${t.code}`);

    for (const item of t.items) {
      const productId = skuMap[item.sku];
      if (!productId) {
        console.warn(`    ⚠️  SKU ${item.sku} not found, skipping item`);
        continue;
      }
      await prisma.solutionTemplateItem.create({
        data: {
          solutionTemplateId: template.id,
          productId,
          requirementType: item.requirementType as RequirementType,
          defaultQuantity: item.qty,
          reason: item.reason,
          priority: item.requirementType === 'REQUIRED' ? 1 : item.requirementType === 'RECOMMENDED' ? 2 : 3,
        },
      });
      console.log(`     • ${item.requirementType} — ${item.sku} (qty: ${item.qty})`);
    }
  }

  return templateMap;
}

// ============================================================================
// STEP 6 — DECISION RULES (platform-wide, tenantId = null)
// ============================================================================

async function seedDecisionRules(templateMap: Record<string, string>) {
  console.log('\n🧠 Seeding decision rules...');

  for (const r of DECISION_RULES) {
    const solutionTemplateId = templateMap[r.templateCode];
    if (!solutionTemplateId) {
      console.warn(`  ⚠️  Template ${r.templateCode} not found for rule ${r.code}`);
      continue;
    }
    await prisma.decisionRule.create({
      data: {
        tenantId: null, // platform standard — applies to all tenants
        code: r.code,
        name: r.name,
        description: r.description,
        status: r.status as DecisionRuleStatus,
        version: r.version,
        priority: r.priority,
        conditions: r.conditions,
        solutionTemplateId,
        active: true,
      },
    });
    console.log(`  ✅ ${r.code}`);
  }
}

// ============================================================================
// STEP 7 — DEMO PILOT DATA (customers, quotes, recommendation runs/feedback)
// ============================================================================

async function seedDemoPilotData(
  tenantId: string,
  skuMap: Record<string, string>,
) {
  console.log('\n🧪 Seeding demo pilot data...');

  const customerSeeds = [
    { name: 'Ravi Borewell Works', phone: '9000000001' },
    { name: 'Lakshmi Farms', phone: '9000000002' },
    { name: 'Suresh Agro', phone: '9000000003' },
    { name: 'Greenfield Estates', phone: '9000000004' },
    { name: 'City Pumps Service', phone: '9000000005' },
  ];

  const customerMap: Record<string, string> = {};

  for (const customer of customerSeeds) {
    const existing = await prisma.customer.findFirst({
      where: {
        tenantId,
        phone: customer.phone,
      },
    });

    const upserted = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: customer.name,
            active: true,
          },
        })
      : await prisma.customer.create({
          data: {
            tenantId,
            name: customer.name,
            phone: customer.phone,
            active: true,
          },
        });

    customerMap[customer.name] = upserted.id;
  }

  const existingQuoteCount = await prisma.quote.count({
    where: { tenantId },
  });

  const productRows = await prisma.product.findMany({
    where: {
      tenantId,
      id: {
        in: Object.values(skuMap),
      },
    },
    select: {
      id: true,
      sellingPrice: true,
    },
  });

  const productPriceById = new Map(
    productRows.map((product) => [product.id, Number(product.sellingPrice)]),
  );

  if (existingQuoteCount < 5) {
    const quoteTemplates: Array<{
      customerName: string;
      skus: Array<{ sku: string; qty: number }>;
      notes: string;
    }> = [
      {
        customerName: 'Ravi Borewell Works',
        skus: [
          { sku: 'MOT-TEX-3HP-1P', qty: 1 },
          { sku: 'STR-3HP-1P', qty: 1 },
          { sku: 'CAB-4SQMM', qty: 330 },
          { sku: 'PIP-HDPE-32', qty: 330 },
          { sku: 'ROP-NYLON', qty: 340 },
        ],
        notes: 'Demo quote for 330 ft single phase installation',
      },
      {
        customerName: 'Lakshmi Farms',
        skus: [
          { sku: 'MOT-CRI-2HP-1P', qty: 1 },
          { sku: 'ROP-NYLON', qty: 260 },
          { sku: 'VAL-FOOT-BRASS', qty: 1 },
        ],
        notes: 'Demo quote for 250 ft 2HP setup',
      },
      {
        customerName: 'Suresh Agro',
        skus: [
          { sku: 'MOT-CRI-5HP-3P', qty: 1 },
          { sku: 'STR-5HP-3P', qty: 1 },
          { sku: 'CAB-6SQMM', qty: 500 },
          { sku: 'PIP-HDPE-40', qty: 500 },
        ],
        notes: 'Demo quote for 500 ft three phase installation',
      },
      {
        customerName: 'Greenfield Estates',
        skus: [
          { sku: 'MOT-KIR-3HP-1P', qty: 1 },
          { sku: 'STR-3HP-1P', qty: 1 },
          { sku: 'CAB-4SQMM', qty: 320 },
          { sku: 'PIP-HDPE-32', qty: 320 },
        ],
        notes: 'Demo quote showing alternate brand choice',
      },
      {
        customerName: 'City Pumps Service',
        skus: [
          { sku: 'MOT-TEX-2HP-1P', qty: 1 },
          { sku: 'ROP-NYLON', qty: 220 },
        ],
        notes: 'Low-budget demo quote',
      },
    ];

    const missingTemplates = quoteTemplates.slice(existingQuoteCount);

    for (let index = 0; index < missingTemplates.length; index += 1) {
      const template = missingTemplates[index];
      const lineItems = template.skus
        .map((entry) => {
          const productId = skuMap[entry.sku];
          const price = productId ? productPriceById.get(productId) : undefined;

          if (!productId || price === undefined) {
            return null;
          }

          const lineTotal = Number((entry.qty * price).toFixed(2));
          return {
            productId,
            productName: PRODUCTS.find((product) => product.sku === entry.sku)?.name ?? entry.sku,
            quantity: entry.qty,
            unitPrice: price,
            lineTotal,
          };
        })
        .filter(
          (line): line is {
            productId: string;
            productName: string;
            quantity: number;
            unitPrice: number;
            lineTotal: number;
          } => line !== null,
        );

      if (lineItems.length === 0) {
        continue;
      }

      const subtotal = Number(
        lineItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
      );

      await prisma.quote.create({
        data: {
          tenantId,
          customerId: customerMap[template.customerName],
          quoteNumber: `QT-${String(existingQuoteCount + index + 1).padStart(5, '0')}`,
          status: 'DRAFT',
          subtotal,
          taxAmount: 0,
          totalAmount: subtotal,
          notes: template.notes,
          items: {
            create: lineItems,
          },
        },
      });
    }
  }

  const owner = await prisma.user.findFirst({
    where: {
      tenantId,
      email: 'owner@demo.com',
    },
    select: {
      id: true,
    },
  });

  const ruleMap = await prisma.decisionRule.findMany({
    where: {
      code: {
        in: [
          'BORE_WELL_200_280_SINGLE',
          'BORE_WELL_300_360_SINGLE',
          'BORE_WELL_400_550_THREE',
        ],
      },
    },
    select: {
      id: true,
      code: true,
    },
  });

  const ruleIdByCode = new Map(ruleMap.map((rule) => [rule.code, rule.id]));

  const existingRuns = await prisma.recommendationRun.count({
    where: { tenantId },
  });

  if (existingRuns < 4 && owner) {
    const runTemplates = [
      {
        status: RecommendationRunStatus.MATCHED,
        queryInputs: { boreDepthFt: 330, phase: 'SINGLE', budget: 50000 },
        ruleCode: 'BORE_WELL_300_360_SINGLE',
        candidateSku: 'MOT-TEX-3HP-1P',
        candidateScore: 96,
        feedback: RecommendationAction.ACCEPTED,
      },
      {
        status: RecommendationRunStatus.MATCHED,
        queryInputs: { boreDepthFt: 250, phase: 'SINGLE', budget: 40000 },
        ruleCode: 'BORE_WELL_200_280_SINGLE',
        candidateSku: 'MOT-CRI-2HP-1P',
        candidateScore: 94,
        feedback: RecommendationAction.ACCEPTED,
      },
      {
        status: RecommendationRunStatus.MATCHED,
        queryInputs: { boreDepthFt: 330, phase: 'SINGLE', budget: 50000 },
        ruleCode: 'BORE_WELL_300_360_SINGLE',
        candidateSku: 'MOT-KIR-3HP-1P',
        candidateScore: 82,
        feedback: RecommendationAction.REJECTED,
      },
      {
        status: RecommendationRunStatus.MATCHED,
        queryInputs: { boreDepthFt: 330, phase: 'SINGLE', budget: 20000 },
        ruleCode: 'BORE_WELL_300_360_SINGLE',
        candidateSku: 'MOT-TEX-3HP-1P',
        candidateScore: 96,
        feedback: null,
      },
    ];

    for (const template of runTemplates.slice(existingRuns)) {
      const candidateProductId = skuMap[template.candidateSku];
      const decisionRuleId = ruleIdByCode.get(template.ruleCode);

      if (!candidateProductId || !decisionRuleId) {
        continue;
      }

      const run = await prisma.recommendationRun.create({
        data: {
          tenantId,
          userId: owner.id,
          status: template.status,
          queryInputs: template.queryInputs,
          decisionRuleId,
          totalCandidates: 1,
          topScore: template.candidateScore,
        },
      });

      await prisma.recommendationCandidate.create({
        data: {
          runId: run.id,
          productId: candidateProductId,
          rank: 1,
          totalScore: template.candidateScore,
          scoreStock: 30,
          scorePriceMatch: 16,
          scoreAttributeMatch: 40,
          scorePreference: 10,
          selectedReason: 'Demo seeded recommendation candidate',
        },
      });

      if (template.feedback) {
        await prisma.recommendationFeedback.create({
          data: {
            runId: run.id,
            userId: owner.id,
            action: template.feedback,
            acceptedProductIds:
              template.feedback === RecommendationAction.ACCEPTED
                ? [candidateProductId]
                : [],
            rejectedProductIds:
              template.feedback === RecommendationAction.REJECTED
                ? [candidateProductId]
                : [],
            notes:
              template.feedback === RecommendationAction.ACCEPTED
                ? 'Seeded demo accepted recommendation'
                : 'Seeded demo rejected recommendation',
          },
        });
      }
    }
  }

  console.log('  ✅ Demo pilot dataset ready');
}

// ============================================================================
// STEP 8 — COMMERCIAL DATA (purchase orders, payments, returns)
// ============================================================================

async function seedCommercialData(
  tenantId: string,
  skuMap: Record<string, string>,
) {
  console.log('\n💼 Seeding purchases, payments, and returns...');

  const owner = await prisma.user.findFirst({
    where: {
      tenantId,
      email: 'owner@demo.com',
    },
    select: {
      id: true,
    },
  });

  const firstCustomer = await prisma.customer.findFirst({
    where: { tenantId, active: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
    },
  });

  const firstQuote = await prisma.quote.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      quoteNumber: true,
      customerId: true,
      totalAmount: true,
    },
  });

  const existingPoCount = await prisma.purchaseOrder.count({
    where: { tenantId },
  });

  const supplierSeeds = [
    {
      name: 'South Pump Distributors',
      phone: '9000011111',
      email: 'sales@southpump.example',
      gstNumber: '29ABCDE1234F2Z5',
      address: 'Market Yard, Bengaluru',
    },
    {
      name: 'Aqua Tech Wholesale',
      phone: '9000011112',
      email: 'orders@aquatech.example',
      gstNumber: '29FGHIJ5678K1Z2',
      address: 'Industrial Layout, Mysuru',
    },
    {
      name: 'Prime Electricals Supply',
      phone: '9000011113',
      email: 'prime@electricals.example',
      gstNumber: '29LMNOP9012Q3Z4',
      address: 'SP Road, Bengaluru',
    },
  ];

  const supplierByName = new Map<string, { id: string; name: string; phone: string | null; email: string | null; gstNumber: string | null }>();

  for (const seed of supplierSeeds) {
    const supplier = await prisma.supplier.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: seed.name,
        },
      },
      update: {
        phone: seed.phone,
        email: seed.email,
        gstNumber: seed.gstNumber,
        address: seed.address,
        active: true,
      },
      create: {
        tenantId,
        name: seed.name,
        phone: seed.phone,
        email: seed.email,
        gstNumber: seed.gstNumber,
        address: seed.address,
        active: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        gstNumber: true,
      },
    });

    supplierByName.set(supplier.name, supplier);
  }

  let demoPurchaseOrder = await prisma.purchaseOrder.findFirst({
    where: {
      tenantId,
      orderNumber: 'PO-00001',
    },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
    },
  });

  if (!demoPurchaseOrder) {
    const mot3HpId = skuMap['MOT-CRI-3HP-1P'];
    const starter3HpId = skuMap['STR-3HP-1P'];

    if (!mot3HpId || !starter3HpId) {
      console.warn('  ⚠️  Skipping PO seed: required demo products not found');
    } else {
      const poItems = [
        {
          productId: mot3HpId,
          productName: PRODUCTS.find((p) => p.sku === 'MOT-CRI-3HP-1P')?.name ?? '3HP Motor',
          quantity: 2,
          unitCost: 25500,
        },
        {
          productId: starter3HpId,
          productName: PRODUCTS.find((p) => p.sku === 'STR-3HP-1P')?.name ?? '3HP Starter',
          quantity: 2,
          unitCost: 3500,
        },
      ];

      const subtotal = poItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      const taxAmount = Number((subtotal * 0.18).toFixed(2));
      const totalAmount = Number((subtotal + taxAmount).toFixed(2));
      const southPump = supplierByName.get('South Pump Distributors');

      demoPurchaseOrder = await prisma.purchaseOrder.create({
        data: {
          tenantId,
          orderNumber: `PO-${String(existingPoCount + 1).padStart(5, '0')}`,
          status: PurchaseOrderStatus.ORDERED,
          supplierId: southPump?.id,
          supplierName: southPump?.name ?? 'South Pump Distributors',
          supplierPhone: southPump?.phone ?? '9000011111',
          supplierEmail: southPump?.email ?? 'sales@southpump.example',
          supplierGstNumber: southPump?.gstNumber ?? '29ABCDE1234F2Z5',
          subtotal,
          taxAmount,
          totalAmount,
          notes: 'Demo PO using supplier master linkage',
          createdById: owner?.id,
          items: {
            create: poItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitCost: item.unitCost,
              lineTotal: Number((item.quantity * item.unitCost).toFixed(2)),
              receivedQuantity: 0,
            })),
          },
        },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
        },
      });

      const aquaTech = supplierByName.get('Aqua Tech Wholesale');

      if (aquaTech) {
        const secondPo = await prisma.purchaseOrder.findFirst({
          where: {
            tenantId,
            orderNumber: `PO-${String(existingPoCount + 2).padStart(5, '0')}`,
          },
          select: { id: true },
        });

        if (!secondPo) {
          await prisma.purchaseOrder.create({
            data: {
              tenantId,
              orderNumber: `PO-${String(existingPoCount + 2).padStart(5, '0')}`,
              status: PurchaseOrderStatus.ORDERED,
              supplierId: aquaTech.id,
              supplierName: aquaTech.name,
              supplierPhone: aquaTech.phone ?? undefined,
              supplierEmail: aquaTech.email ?? undefined,
              supplierGstNumber: aquaTech.gstNumber ?? undefined,
              subtotal: 1200,
              taxAmount: 216,
              totalAmount: 1416,
              notes: 'Demo secondary PO using supplier master linkage',
              createdById: owner?.id,
              items: {
                create: [
                  {
                    productId: starter3HpId,
                    productName: PRODUCTS.find((p) => p.sku === 'STR-3HP-1P')?.name ?? '3HP Starter',
                    quantity: 0.2,
                    unitCost: 6000,
                    lineTotal: 1200,
                    receivedQuantity: 0,
                  },
                ],
              },
            },
          });
        }
      }
    }
  }

  const existingPayments = await prisma.payment.count({ where: { tenantId } });

  if (firstQuote) {
    const existingQuotePayment = await prisma.payment.findFirst({
      where: {
        tenantId,
        quoteId: firstQuote.id,
      },
      select: { id: true },
    });

    if (!existingQuotePayment) {
      await prisma.payment.create({
        data: {
          tenantId,
          quoteId: firstQuote.id,
          customerId: firstQuote.customerId,
          amount: Number((Number(firstQuote.totalAmount) * 0.4).toFixed(2)),
          direction: PaymentDirection.RECEIVED,
          method: PaymentMethod.UPI,
          status: PaymentStatus.COMPLETED,
          referenceNumber: `RCPT-${String(existingPayments + 1).padStart(5, '0')}`,
          note: `Demo advance received for ${firstQuote.quoteNumber}`,
          createdById: owner?.id,
        },
      });
    }
  }

  if (demoPurchaseOrder) {
    const existingPoPayment = await prisma.payment.findFirst({
      where: {
        tenantId,
        purchaseOrderId: demoPurchaseOrder.id,
      },
      select: { id: true },
    });

    if (!existingPoPayment) {
      await prisma.payment.create({
        data: {
          tenantId,
          purchaseOrderId: demoPurchaseOrder.id,
          amount: Number((Number(demoPurchaseOrder.totalAmount) * 0.5).toFixed(2)),
          direction: PaymentDirection.PAID,
          method: PaymentMethod.BANK_TRANSFER,
          status: PaymentStatus.COMPLETED,
          referenceNumber: `PMT-${String(existingPayments + 2).padStart(5, '0')}`,
          note: `Demo supplier advance paid for ${demoPurchaseOrder.orderNumber}`,
          createdById: owner?.id,
        },
      });
    }
  }

  const ropeId = skuMap['ROP-NYLON'];
  if (firstQuote && ropeId) {
    const existingSalesReturn = await prisma.productReturn.findFirst({
      where: {
        tenantId,
        quoteId: firstQuote.id,
        type: ProductReturnType.SALES_RETURN,
      },
      select: { id: true },
    });

    if (!existingSalesReturn) {
      await prisma.productReturn.create({
        data: {
          tenantId,
          returnNumber: 'RT-00001',
          type: ProductReturnType.SALES_RETURN,
          status: ProductReturnStatus.REQUESTED,
          quoteId: firstQuote.id,
          customerId: firstQuote.customerId,
          reason: 'Customer requested partial return of accessories',
          notes: 'Demo sales return seeded for testing return workflow',
          createdById: owner?.id,
          items: {
            create: [
              {
                productId: ropeId,
                productName: PRODUCTS.find((p) => p.sku === 'ROP-NYLON')?.name ?? 'Nylon Safety Rope',
                quantity: 5,
                unitPrice: 18,
                lineTotal: 90,
                restockToInventory: true,
              },
            ],
          },
        },
      });
    }
  }

  if (demoPurchaseOrder) {
    const existingPurchaseReturn = await prisma.productReturn.findFirst({
      where: {
        tenantId,
        purchaseOrderId: demoPurchaseOrder.id,
        type: ProductReturnType.PURCHASE_RETURN,
      },
      select: { id: true },
    });

    if (!existingPurchaseReturn) {
      const starter3HpId = skuMap['STR-3HP-1P'];

      if (starter3HpId) {
        await prisma.productReturn.create({
          data: {
            tenantId,
            returnNumber: 'RT-00002',
            type: ProductReturnType.PURCHASE_RETURN,
            status: ProductReturnStatus.REQUESTED,
            purchaseOrderId: demoPurchaseOrder.id,
            customerId: firstCustomer?.id,
            reason: 'Damaged item from supplier shipment',
            notes: 'Demo purchase return seeded for approval/completion testing',
            createdById: owner?.id,
            items: {
              create: [
                {
                  productId: starter3HpId,
                  productName: PRODUCTS.find((p) => p.sku === 'STR-3HP-1P')?.name ?? '3HP Starter',
                  quantity: 1,
                  unitPrice: 3500,
                  lineTotal: 3500,
                  restockToInventory: false,
                },
              ],
            },
          },
        });
      }
    }
  }

  console.log('  ✅ Demo purchases, payments, returns, and suppliers seeded');
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

async function runAllSeeds() {
  try {
    const tenant = await ensureDemoTenant();
    console.log('');

    await clearData();
    const attrMap = await seedAttributeDefinitions();
    const categoryMap = await seedCategories(tenant.id);
    const skuMap = await seedProducts(tenant.id, categoryMap, attrMap);
    await seedCompatibility(tenant.id, skuMap);
    const templateMap = await seedSolutionTemplates(tenant.id, skuMap);
    await seedDecisionRules(templateMap);
    await seedDemoPilotData(tenant.id, skuMap);
    await seedCommercialData(tenant.id, skuMap);

    console.log('\n✨ All seeds completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   Attribute definitions : ${Object.keys(attrMap).length}`);
    console.log(`   Categories            : ${Object.keys(categoryMap).length}`);
    console.log(`   Products              : ${Object.keys(skuMap).length}`);
    console.log(`   Compatibility rules   : ${COMPATIBILITY.length}`);
    console.log(`   Solution templates    : ${SOLUTION_TEMPLATES.length}`);
    console.log(`   Decision rules        : ${DECISION_RULES.length}`);
  } catch (error) {
    console.error('\n❌ Fatal error in seeds:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runAllSeeds().catch((error) => {
  console.error(error);
  process.exit(1);
});


