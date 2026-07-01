import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

const SUPPORTED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseExcelRows(file?: Express.Multer.File): Record<string, unknown>[] {
  if (!file) {
    throw new BadRequestException('File is required');
  }

  if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException('Only .xlsx, .xls, and .csv files are supported');
  }

  try {
    const workbook = XLSX.read(file.buffer, { type: 'buffer', raw: false });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new BadRequestException('Excel file has no sheets');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
      blankrows: false,
    });

    return rows.map((row) => {
      const normalizedRow: Record<string, unknown> = {};
      Object.entries(row).forEach(([key, value]) => {
        normalizedRow[normalizeHeader(key)] = value;
      });
      return normalizedRow;
    });
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Invalid Excel file');
  }
}

export function getStringCell(
  row: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

export function getNumberCell(
  row: Record<string, unknown>,
  keys: string[],
): number | null {
  const value = getStringCell(row, keys);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
