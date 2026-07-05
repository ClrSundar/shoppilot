import { PrismaClient, AttributeDataType, CompatibilityRelationType, RequirementType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedMotorAttributes() {
  console.log('🌱 Seeding motor attributes...');

  try {
    // 1. Create Attribute Definitions for motors (platform-wide, no tenantId)
    
    // Check if attributes already exist
    const hpExists = await prisma.attributeDefinition.findFirst({ where: { code: 'HP' } });
    if (!hpExists) {
      const hpAttr = await prisma.attributeDefinition.create({
        data: {
          code: 'HP',
          name: 'Horsepower',
          dataType: AttributeDataType.NUMBER,
          unit: 'hp',
          description: 'Motor horsepower rating',
          active: true,
        },
      });
      console.log(`✅ Created HP attribute: ${hpAttr.id}`);
    } else {
      console.log(`⏭️  HP attribute already exists, skipping...`);
    }

    const headExists = await prisma.attributeDefinition.findFirst({ where: { code: 'HEAD' } });
    if (!headExists) {
      const headAttr = await prisma.attributeDefinition.create({
        data: {
          code: 'HEAD',
          name: 'Total Head',
          dataType: AttributeDataType.NUMBER,
          unit: 'feet',
          description: 'Maximum discharge head in feet',
          active: true,
        },
      });
      console.log(`✅ Created HEAD attribute: ${headAttr.id}`);
    } else {
      console.log(`⏭️  HEAD attribute already exists, skipping...`);
    }

    const phaseExists = await prisma.attributeDefinition.findFirst({ where: { code: 'PHASE' } });
    if (!phaseExists) {
      const phaseAttr = await prisma.attributeDefinition.create({
        data: {
          code: 'PHASE',
          name: 'Phase',
          dataType: AttributeDataType.SELECT,
          allowedValues: JSON.stringify(['SINGLE', 'THREE']),
          description: 'Electrical phase (single-phase or three-phase)',
          active: true,
        },
      });
      console.log(`✅ Created PHASE attribute: ${phaseAttr.id}`);
    } else {
      console.log(`⏭️  PHASE attribute already exists, skipping...`);
    }

    console.log('✅ Motor attributes seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding motor attributes:', error);
    throw error;
  }
}

async function seedCompatibilityAndSolutions() {
  console.log('\n🔗 Seeding product compatibility rules...');

  try {
    // Get first tenant to work with
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      console.warn('⚠️  No tenant found. Skipping compatibility seeding (run after tenant creation).');
      return; // Continue to next seed function
    }

    // Find motor products
    const motor3hp = await prisma.product.findFirst({
      where: { name: 'Motor 3HP', tenantId: tenant.id },
    });
    const motor2hp = await prisma.product.findFirst({
      where: { name: 'Motor 2HP', tenantId: tenant.id },
    });
    const starter = await prisma.product.findFirst({
      where: { name: 'Starter 1-3HP', tenantId: tenant.id },
    });
    const rope = await prisma.product.findFirst({
      where: { name: 'Safety Rope 12mm', tenantId: tenant.id },
    });

    // If motors don't exist, we can't seed compatibility. Log a warning and continue.
    if (!motor3hp || !motor2hp || !starter || !rope) {
      console.warn('⚠️  Some motor products not found. Skipping compatibility seeding.');
      console.warn(`  - Motor 3HP: ${motor3hp ? 'found' : 'NOT FOUND'}`);
      console.warn(`  - Motor 2HP: ${motor2hp ? 'found' : 'NOT FOUND'}`);
      console.warn(`  - Starter: ${starter ? 'found' : 'NOT FOUND'}`);
      console.warn(`  - Rope: ${rope ? 'found' : 'NOT FOUND'}`);
      return; // Continue to next seed function
    }

    // Create compatibility rules
    // Motor 3HP REQUIRED_WITH Starter
    const compatibility1 = await prisma.productCompatibility.upsert({
      where: {
        tenantId_sourceProductId_targetProductId_relationType: {
          tenantId: tenant.id,
          sourceProductId: motor3hp.id,
          targetProductId: starter.id,
          relationType: CompatibilityRelationType.REQUIRED_WITH,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sourceProductId: motor3hp.id,
        targetProductId: starter.id,
        relationType: CompatibilityRelationType.REQUIRED_WITH,
        reason: 'Starter required to start the motor safely',
        priority: 1,
      },
    });
    console.log(`✅ Created compatibility: Motor 3HP REQUIRED_WITH Starter`);

    // Motor 3HP RECOMMENDED_WITH Rope
    const compatibility2 = await prisma.productCompatibility.upsert({
      where: {
        tenantId_sourceProductId_targetProductId_relationType: {
          tenantId: tenant.id,
          sourceProductId: motor3hp.id,
          targetProductId: rope.id,
          relationType: CompatibilityRelationType.RECOMMENDED_WITH,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sourceProductId: motor3hp.id,
        targetProductId: rope.id,
        relationType: CompatibilityRelationType.RECOMMENDED_WITH,
        reason: 'Safety rope recommended for wellhead protection',
        priority: 2,
      },
    });
    console.log(`✅ Created compatibility: Motor 3HP RECOMMENDED_WITH Safety Rope`);

    // Motor 2HP REQUIRED_WITH Starter
    const compatibility3 = await prisma.productCompatibility.upsert({
      where: {
        tenantId_sourceProductId_targetProductId_relationType: {
          tenantId: tenant.id,
          sourceProductId: motor2hp.id,
          targetProductId: starter.id,
          relationType: CompatibilityRelationType.REQUIRED_WITH,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sourceProductId: motor2hp.id,
        targetProductId: starter.id,
        relationType: CompatibilityRelationType.REQUIRED_WITH,
        reason: 'Starter required to start the motor safely',
        priority: 1,
      },
    });
    console.log(`✅ Created compatibility: Motor 2HP REQUIRED_WITH Starter`);

    console.log('✅ Compatibility rules seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding compatibility:', error);
    // Don't throw - this is optional during Phase 2
  }
}

async function seedSolutionTemplates() {
  console.log('\n📋 Seeding solution templates...');

  try {
    // Get first tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      console.warn('⚠️  No tenant found. Skipping solution template seeding (run after tenant creation).');
      return;
    }

    // Find products and category
    const motor3hp = await prisma.product.findFirst({
      where: { name: 'Motor 3HP', tenantId: tenant.id },
    });
    const starter = await prisma.product.findFirst({
      where: { name: 'Starter 1-3HP', tenantId: tenant.id },
    });
    const rope = await prisma.product.findFirst({
      where: { name: 'Safety Rope 12mm', tenantId: tenant.id },
    });

    if (!motor3hp || !starter || !rope) {
      console.warn('⚠️  Some products not found. Skipping solution template seeding.');
      return;
    }

    // Create solution template: BOREWELL_STANDARD_3HP
    const template = await prisma.solutionTemplate.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: 'BOREWELL_STANDARD_3HP',
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        code: 'BOREWELL_STANDARD_3HP',
        name: 'Standard 3HP Borewell Solution',
        purpose: 'Complete solution for 3HP submersible borewell installation',
        description: 'Includes motor, starter, and safety rope for a standard 3HP borewell setup',
        active: true,
      },
    });
    console.log(`✅ Created solution template: ${template.name}`);

    // Add solution items
    // Item 1: Motor 3HP (REQUIRED)
    const item1 = await prisma.solutionTemplateItem.create({
      data: {
        solutionTemplateId: template.id,
        productId: motor3hp.id,
        requirementType: RequirementType.REQUIRED,
        defaultQuantity: 1,
        reason: 'Primary pumping motor for the borewell',
        priority: 1,
      },
    });
    console.log(`  ✅ Added: Motor 3HP (REQUIRED)`);

    // Item 2: Starter (REQUIRED)
    const item2 = await prisma.solutionTemplateItem.create({
      data: {
        solutionTemplateId: template.id,
        productId: starter.id,
        requirementType: RequirementType.REQUIRED,
        defaultQuantity: 1,
        reason: 'Motor starter for safe operation',
        priority: 1,
      },
    });
    console.log(`  ✅ Added: Starter 1-3HP (REQUIRED)`);

    // Item 3: Safety Rope (RECOMMENDED)
    const item3 = await prisma.solutionTemplateItem.create({
      data: {
        solutionTemplateId: template.id,
        productId: rope.id,
        requirementType: RequirementType.RECOMMENDED,
        defaultQuantity: 1,
        reason: 'Safety rope for wellhead protection',
        priority: 2,
      },
    });
    console.log(`  ✅ Added: Safety Rope 12mm (RECOMMENDED)`);

    console.log('✅ Solution templates seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding solution templates:', error);
    // Don't throw - this is optional during Phase 2
  }
}

async function runAllSeeds() {
  try {
    await seedMotorAttributes();
    await seedCompatibilityAndSolutions();
    await seedSolutionTemplates();
    console.log('\n✨ All seeds completed successfully!');
  } catch (error) {
    console.error('Fatal error in seeds:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runAllSeeds().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
