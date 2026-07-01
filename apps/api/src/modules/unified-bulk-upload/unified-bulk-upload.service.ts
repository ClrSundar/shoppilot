import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getNumberCell, getStringCell } from '../../common/utils/excel.util';
import { InventoryMovementType, InventoryReferenceType } from '@prisma/client';

export interface BulkUploadResult {
  totalSheets: number;
  categories: {
    totalRows: number;
    created: number;
    skipped: number;
    errors: string[];
  };
  products: {
    totalRows: number;
    created: number;
    skipped: number;
    errors: string[];
  };
  inventory: {
    totalRows: number;
    initialized: number;
    skipped: number;
    errors: string[];
  };
  summary: {
    totalCreated: number;
    totalSkipped: number;
  };
}

type BulkUploadSection = 'category' | 'product' | 'inventory';

type SectionRowSource = {
  rows: Record<string, unknown>[];
  rowNumberOffset: number;
};

@Injectable()
export class UnifiedBulkUploadService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly sectionAliases: Record<BulkUploadSection, string[]> = {
      category: ['category', 'categories'],
      product: ['product', 'products'],
      inventory: ['inventory', 'stock', 'stocks'],
    };

  private static readonly unifiedTypeHeaders = [
    'type',
    'rowtype',
    'recordtype',
    'entity',
    'section',
  ];

  private static readonly combinedSheetProductHeaders = [
    'name',
    'productname',
    'category',
    'costprice',
    'sellingprice',
    'mrp',
    'stockqty',
  ];

  async bulkUpload(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<BulkUploadResult> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const supportedMimeTypes = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]);

    if (!supportedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'Only .xlsx, .xls, and .csv files are supported',
      );
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer', raw: false });

    const result: BulkUploadResult = {
      totalSheets: workbook.SheetNames.length,
      categories: { totalRows: 0, created: 0, skipped: 0, errors: [] },
      products: { totalRows: 0, created: 0, skipped: 0, errors: [] },
      inventory: { totalRows: 0, initialized: 0, skipped: 0, errors: [] },
      summary: { totalCreated: 0, totalSkipped: 0 },
    };

    // Process Categories sheet
    const categoriesResult = await this.processCategories(tenantId, workbook);
    result.categories = categoriesResult;

    // Process Products sheet
    const productsResult = await this.processProducts(tenantId, workbook);
    result.products = productsResult;

    // Process Inventory sheet
    const inventoryResult = await this.processInventory(
      tenantId,
      userId,
      workbook,
    );
    result.inventory = inventoryResult;

    // Calculate summary
    result.summary.totalCreated =
      result.categories.created +
      result.products.created +
      result.inventory.initialized;
    result.summary.totalSkipped =
      result.categories.skipped +
      result.products.skipped +
      result.inventory.skipped;

    return result;
  }

  private normalizeHeader(header: string): string {
    return header
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private parseSheetRows(
    workbook: XLSX.WorkBook,
    sheetName: string,
  ): Record<string, unknown>[] {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return [];
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
      blankrows: false,
    });

    return rows.map((row) => {
      const normalizedRow: Record<string, unknown> = {};
      Object.entries(row).forEach(([key, value]) => {
        normalizedRow[this.normalizeHeader(key)] = value;
      });
      return normalizedRow;
    });
  }

  private getFirstSheetRows(
    workbook: XLSX.WorkBook,
  ): Record<string, unknown>[] {
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }

    return this.parseSheetRows(workbook, firstSheetName);
  }

  private isCombinedCatalogSheet(rows: Record<string, unknown>[]): boolean {
    if (rows.length === 0) {
      return false;
    }

    const hasTypeHeader = UnifiedBulkUploadService.unifiedTypeHeaders.some(
      (header) => rows.some((row) => header in row),
    );

    if (hasTypeHeader) {
      return false;
    }

    return rows.some((row) => {
      const keys = new Set(Object.keys(row));
      return UnifiedBulkUploadService.combinedSheetProductHeaders.some(
        (header) => keys.has(header),
      );
    });
  }

  private getCombinedCatalogRows(
    workbook: XLSX.WorkBook,
    section: BulkUploadSection,
  ): SectionRowSource | null {
    const rows = this.getFirstSheetRows(workbook);
    if (!this.isCombinedCatalogSheet(rows)) {
      return null;
    }

    if (section === 'category') {
      const seen = new Set<string>();
      const categoryRows: Record<string, unknown>[] = [];

      rows.forEach((row) => {
        const categoryName = getStringCell(row, ['category', 'categoryname']);
        if (!categoryName) {
          return;
        }

        const normalizedName = categoryName.toLowerCase();
        if (seen.has(normalizedName)) {
          return;
        }

        seen.add(normalizedName);
        categoryRows.push({ name: categoryName });
      });

      return { rows: categoryRows, rowNumberOffset: 2 };
    }

    if (section === 'inventory') {
      return {
        rows: rows.filter(
          (row) =>
            getNumberCell(row, [
              'stockqty',
              'openingstock',
              'stock',
              'quantity',
            ]) !== null,
        ),
        rowNumberOffset: 2,
      };
    }

    return { rows, rowNumberOffset: 2 };
  }

  private getUnifiedSheetRows(
    workbook: XLSX.WorkBook,
    section: BulkUploadSection,
  ): SectionRowSource | null {
    if (workbook.SheetNames.length === 0) {
      return { rows: [], rowNumberOffset: 2 };
    }

    const rows = this.getFirstSheetRows(workbook);
    if (rows.length === 0) {
      return { rows: [], rowNumberOffset: 2 };
    }

    const typeHeader = UnifiedBulkUploadService.unifiedTypeHeaders.find(
      (header) => rows.some((row) => header in row),
    );

    if (!typeHeader) {
      return null;
    }

    const allowedTypes = new Set(
      UnifiedBulkUploadService.sectionAliases[section].map((value) =>
        this.normalizeHeader(value),
      ),
    );

    return {
      rows: rows.filter((row) => {
        const typeValue = getStringCell(row, [typeHeader]);
        if (!typeValue) {
          return false;
        }

        return allowedTypes.has(this.normalizeHeader(typeValue));
      }),
      rowNumberOffset: 2,
    };
  }

  private getRowsForSection(
    workbook: XLSX.WorkBook,
    section: BulkUploadSection,
    fallbackSheetMatcher: (sheetName: string) => boolean,
    fallbackSheetName: string,
  ): SectionRowSource {
    const combinedRows = this.getCombinedCatalogRows(workbook, section);
    if (combinedRows !== null) {
      return combinedRows;
    }

    const unifiedRows = this.getUnifiedSheetRows(workbook, section);
    if (unifiedRows !== null) {
      return unifiedRows;
    }

    const sheetName =
      workbook.SheetNames.find(fallbackSheetMatcher) || fallbackSheetName;

    return {
      rows: this.parseSheetRows(workbook, sheetName),
      rowNumberOffset: 2,
    };
  }

  private async processCategories(
    tenantId: string,
    workbook: XLSX.WorkBook,
  ): Promise<BulkUploadResult['categories']> {
    const { rows, rowNumberOffset } = this.getRowsForSection(
      workbook,
      'category',
      (name) => name.toLowerCase().includes('categor'),
      'Categories',
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = getStringCell(row, ['name', 'categoryname', 'category']);
      const description = getStringCell(row, ['description']);

      if (!name) {
        skipped += 1;
        errors.push(`Row ${index + rowNumberOffset}: Name is required`);
        continue;
      }

      const existing = await this.prisma.productCategory.findFirst({
        where: { tenantId, name },
      });

      if (existing) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: Category '${name}' already exists`,
        );
        continue;
      }

      await this.prisma.productCategory.create({
        data: {
          tenantId,
          name,
          description: description || undefined,
        },
      });

      created += 1;
    }

    return {
      totalRows: rows.length,
      created,
      skipped,
      errors,
    };
  }

  private async processProducts(
    tenantId: string,
    workbook: XLSX.WorkBook,
  ): Promise<BulkUploadResult['products']> {
    const { rows, rowNumberOffset } = this.getRowsForSection(
      workbook,
      'product',
      (name) => name.toLowerCase().includes('product'),
      'Products',
    );

    const categories = await this.prisma.productCategory.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
    });

    const categoriesByName = new Map(
      categories.map((category) => [category.name.toLowerCase(), category.id]),
    );
    const categoriesById = new Set(categories.map((category) => category.id));

    const existingProducts = await this.prisma.product.findMany({
      where: { tenantId, active: true },
      select: { name: true, sku: true },
    });

    const productNameSet = new Set(
      existingProducts.map((p) => p.name.toLowerCase()),
    );
    const productSkuSet = new Set(
      existingProducts.filter((p) => p.sku).map((p) => p.sku!.toLowerCase()),
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = getStringCell(row, ['name', 'productname', 'product']);
      const categoryIdCell = getStringCell(row, ['categoryid']);
      const categoryName = getStringCell(row, ['category', 'categoryname']);
      const costPrice = getNumberCell(row, ['costprice', 'cost']);
      const sellingPrice = getNumberCell(row, ['sellingprice', 'price', 'mrp']);
      const sku = getStringCell(row, ['sku']) || undefined;

      if (!name || costPrice === null || sellingPrice === null) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: name, costPrice and sellingPrice are required`,
        );
        continue;
      }

      if (productNameSet.has(name.toLowerCase())) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: Product '${name}' already exists`,
        );
        continue;
      }

      if (sku && productSkuSet.has(sku.toLowerCase())) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: Product with SKU '${sku}' already exists`,
        );
        continue;
      }

      let categoryId = '';
      if (categoryIdCell && categoriesById.has(categoryIdCell)) {
        categoryId = categoryIdCell;
      } else if (categoryName) {
        categoryId = categoriesByName.get(categoryName.toLowerCase()) ?? '';
      }

      if (!categoryId) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: valid categoryId or category name is required`,
        );
        continue;
      }

      await this.prisma.product.create({
        data: {
          tenantId,
          categoryId,
          name,
          sku,
          brand: getStringCell(row, ['brand']) || undefined,
          unit: getStringCell(row, ['unit']) || 'NOS',
          costPrice,
          sellingPrice,
          imageUrl: getStringCell(row, ['imageurl', 'image']) || undefined,
        },
      });

      productNameSet.add(name.toLowerCase());
      if (sku) {
        productSkuSet.add(sku.toLowerCase());
      }

      created += 1;
    }

    return {
      totalRows: rows.length,
      created,
      skipped,
      errors,
    };
  }

  private async processInventory(
    tenantId: string,
    userId: string,
    workbook: XLSX.WorkBook,
  ): Promise<BulkUploadResult['inventory']> {
    const { rows, rowNumberOffset } = this.getRowsForSection(
      workbook,
      'inventory',
      (name) =>
        name.toLowerCase().includes('inventory') ||
        name.toLowerCase().includes('stock'),
      'Inventory',
    );

    const products = await this.prisma.product.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, sku: true },
    });

    const productsByName = new Map(
      products.map((p) => [p.name.toLowerCase(), p.id]),
    );
    const productsById = new Map(products.map((p) => [p.id, p]));
    const productsBySku = new Map(
      products.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p.id]),
    );

    let initialized = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const productIdCell = getStringCell(row, ['productid']);
      const productName = getStringCell(row, [
        'productname',
        'product',
        'name',
      ]);
      const sku = getStringCell(row, ['sku']);
      const openingStock = getNumberCell(row, [
        'stockqty',
        'openingstock',
        'stock',
        'quantity',
      ]);
      const reorderLevel = getNumberCell(row, ['reorderlevel', 'minstock']);

      if (openingStock === null) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: Opening stock is required`,
        );
        continue;
      }

      let productId = '';

      if (productIdCell && productsById.has(productIdCell)) {
        productId = productIdCell;
      } else if (productName) {
        productId = productsByName.get(productName.toLowerCase()) ?? '';
      } else if (sku) {
        productId = productsBySku.get(sku.toLowerCase()) ?? '';
      }

      if (!productId) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: Product not found (provide productId, productName, or sku)`,
        );
        continue;
      }

      const existingStock = await this.prisma.inventoryStock.findUnique({
        where: {
          tenantId_productId: {
            tenantId,
            productId,
          },
        },
      });

      if (existingStock) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: Stock already initialized for this product`,
        );
        continue;
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          const createdStock = await tx.inventoryStock.create({
            data: {
              tenantId,
              productId,
              onHand: openingStock,
              reorderLevel: reorderLevel ?? 0,
            },
          });

          if (openingStock > 0) {
            await tx.inventoryLedgerEntry.create({
              data: {
                tenantId,
                stockId: createdStock.id,
                productId,
                movementType: InventoryMovementType.IN,
                quantity: openingStock,
                referenceType: InventoryReferenceType.MANUAL,
                note: 'Bulk initialized stock',
                createdById: userId,
              },
            });
          }

          return createdStock;
        });

        initialized += 1;
      } catch (error) {
        skipped += 1;
        errors.push(
          `Row ${index + rowNumberOffset}: Error initializing stock - ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    return {
      totalRows: rows.length,
      initialized,
      skipped,
      errors,
    };
  }
}
