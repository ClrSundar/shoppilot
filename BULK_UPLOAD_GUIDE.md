# Bulk Upload Features - User Guide

## Overview

You now have two ways to upload your data:
1. **Individual uploads** - Upload categories, products, or inventory separately (existing endpoints)
2. **Unified bulk upload** - Upload all three (categories, products, inventory) at once from a single Excel file (NEW)

Additionally, the product upload now **automatically skips duplicates** to prevent adding the same product multiple times.

---

## Feature 1: Duplicate Prevention in Products

### What Changed
When uploading products via `POST /products/bulk-upload`, the system now:
- **Checks for existing products by name** - If a product with the same name exists, it's skipped
- **Checks for existing SKUs** - If a SKU is already used, that row is skipped
- **Prevents duplicates within the batch** - If the same product appears twice in your Excel file, only the first one is created

### Example Response
```json
{
  "totalRows": 3,
  "created": 1,
  "skipped": 2,
  "errors": [
    "Row 2: Product 'Laptop' already exists",
    "Row 3: Product with SKU 'SKU-001' already exists"
  ]
}
```

### Excel Format
| name | category | costPrice | sellingPrice | sku | brand | unit |
|------|----------|-----------|--------------|-----|-------|------|
| Laptop | Electronics | 500 | 750 | SKU-001 | Dell | NOS |
| Monitor | Electronics | 150 | 200 | SKU-002 | HP | NOS |

---

## Feature 2: Inventory Bulk Upload

### New Endpoint
```
POST /inventory/stocks/bulk-upload
Content-Type: multipart/form-data

file: [excel-file]
```

### What It Does
- Initializes stock for multiple products at once
- Links products by ID, name, or SKU
- Creates opening stock records with reorder level
- Records the transaction in inventory ledger

### Excel Format
| productId | productName | sku | openingStock | reorderLevel |
|-----------|-------------|-----|--------------|--------------|
| (optional) | Laptop | (optional) | 10 | 5 |
| (optional) | Monitor | (optional) | 20 | 8 |

**Note:** Provide at least one of: `productId`, `productName`, or `sku` to identify the product

### Example Response
```json
{
  "totalRows": 2,
  "initialized": 2,
  "skipped": 0,
  "errors": []
}
```

---

## Feature 3: Unified Bulk Upload (NEW!)

### Endpoint
```
POST /bulk-upload
Content-Type: multipart/form-data

file: [single-sheet-excel-file]
```

### What It Does
Uploads **all three data types in one shot** from a single Excel or CSV file using one sheet:
1. **Categories** - Created first, skips existing
2. **Products** - Created second, skips duplicates
3. **Inventory** - Initialized last, links to newly created products

### Excel File Structure

Create a single Excel file with **one sheet**. If you already have a product-style sheet, that is also supported.

### Supported Product Sheet Format

This format works directly:

| Product Name | Category | Brand | Unit | Cost Price | MRP | Selling Price | Stock Qty |
|--------------|----------|-------|------|------------|-----|---------------|-----------|
| Laptop | Electronics | Dell | NOS | 500 | 800 | 750 | 10 |
| Monitor | Electronics | HP | NOS | 150 | 220 | 200 | 20 |
| Hammer | Hardware | Stanley | NOS | 10 | 18 | 15 | 50 |

How this sheet is handled:
- `Category` values are created automatically if they do not already exist.
- Each row creates one product.
- `Stock Qty` initializes opening stock for that product.
- `Selling Price` is used first; `MRP` is also accepted as a selling-price column.

### Alternate Typed Row Format

If needed, you can also use a typed row format with a `type` column:

| type | name | description | category | costPrice | sellingPrice | sku | brand | unit | openingStock | reorderLevel |
|------|------|-------------|----------|-----------|--------------|-----|-------|------|--------------|--------------|
| category | Electronics | Electronic devices |  |  |  |  |  |  |  |  |
| category | Hardware | Tools and equipment |  |  |  |  |  |  |  |  |
| product | Laptop |  | Electronics | 500 | 750 | LAPTOP-001 | Dell | NOS |  |  |
| product | Monitor |  | Electronics | 150 | 200 | MON-001 | HP | NOS |  |  |
| product | Hammer |  | Hardware | 10 | 15 | HAMMER-001 | Stanley | NOS |  |  |
| inventory | Laptop |  |  |  |  | LAPTOP-001 |  |  | 10 | 5 |
| inventory | Monitor |  |  |  |  | MON-001 |  |  | 20 | 8 |
| inventory | Hammer |  |  |  |  | HAMMER-001 |  |  | 50 | 20 |

### Required Fields By Row Type

- `category`: `type`, `name`
- `product`: `type`, `name`, `category`, `costPrice`, `sellingPrice`
- `inventory`: `type`, `openingStock`, plus one product identifier such as `name` or `sku`

Unused columns can be left blank for that row type.

### Example Response
```json
{
  "totalSheets": 1,
  "categories": {
    "totalRows": 2,
    "created": 2,
    "skipped": 0,
    "errors": []
  },
  "products": {
    "totalRows": 3,
    "created": 3,
    "skipped": 0,
    "errors": []
  },
  "inventory": {
    "totalRows": 3,
    "initialized": 3,
    "skipped": 0,
    "errors": []
  },
  "summary": {
    "totalCreated": 8,
    "totalSkipped": 0
  }
}
```

### Column Name Flexibility

The system accepts multiple column name variations. You can use any of these:

**For Row Type:**
- Header: `type`, `rowType`, `recordType`, `entity`, `section`
- Values: `category`, `product`, `inventory` (also accepts plural values like `categories`, `products`, `stocks`)

**For Product Name:**
- `name`, `productname`, `product`

**For Your Current Header Names:**
- `Product Name` maps to `productname`
- `Cost Price` maps to `costprice`
- `Selling Price` maps to `sellingprice`
- `Stock Qty` maps to `stockqty`

**For Category:**
- `category`, `categoryname`, `categoryid`

**For Prices:**
- Cost Price: `costprice`, `cost`
- Selling Price: `sellingprice`, `price`, `mrp`

**For SKU:**
- `sku`

**For Inventory:**
- Opening Stock: `stockqty`, `openingstock`, `stock`, `quantity`
- Reorder Level: `reorderlevel`, `minstock`
- Product: `productid`, `productname`, `product`, `name`, `sku`

---

## Workflow Example

### Step 1: Prepare Your Excel File
Create a single file with one sheet as shown above.

### Step 2: Upload
```bash
curl -X POST http://localhost:3000/bulk-upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@your-data.xlsx"
```

### Step 3: Review Results
- ✅ Success rows show in `created` count
- ⏭️ Skipped rows show in `skipped` count with reasons in `errors`
- 🔄 Fix any errors and re-upload (duplicates will be skipped automatically)

---

## When to Use What

| Scenario | Endpoint |
|----------|----------|
| Upload **only categories** | `POST /categories/bulk-upload` |
| Upload **only products** | `POST /products/bulk-upload` |
| Upload **only inventory** | `POST /inventory/stocks/bulk-upload` |
| Upload **all three together** | `POST /bulk-upload` |
| Upload **same data multiple times** | ✅ Duplicates auto-skipped, safe to retry |

---

## Error Handling

### Common Errors & Solutions

**"Product already exists"**
- Product with that name already exists
- Solution: Change the name or remove from next upload

**"Product with SKU already exists"**
- Another product has this SKU
- Solution: Use a unique SKU or verify the existing product

**"Category required"**
- Product references non-existent category
- Solution: Add category first or use correct category name

**"Product not found"**
- Can't find product for inventory by ID, name, or SKU
- Solution: Verify product exists, check spelling/IDs

**"Stock already initialized"**
- Product already has opening stock
- Solution: Use adjustments endpoint to modify existing stock

---

## Tips & Best Practices

1. **Keep related rows grouped**: Categories first, then products, then inventory
2. **Use product names for linking**: Easier than IDs, especially for inventory sheet
3. **Include SKUs**: Makes product identification foolproof
4. **Keep backups**: Save your Excel template for future uploads
5. **Test with small batches**: Try 2-3 rows first to verify format
6. **Handle errors iteratively**: Fix errors in Excel, re-upload (duplicates won't be re-added)
