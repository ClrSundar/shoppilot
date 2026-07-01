'use client';

import Link from 'next/link';
import { ChangeEvent, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import {
  inventoryService,
  UnifiedBulkUploadResult,
} from '@/services/inventory.service';

const sectionMeta = [
  {
    key: 'categories',
    label: 'Categories',
    successLabel: 'created',
  },
  {
    key: 'products',
    label: 'Products',
    successLabel: 'created',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    successLabel: 'initialized',
  },
] as const;

export default function InventoryBulkUploadPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();
  const [result, setResult] = useState<UnifiedBulkUploadResult | null>(null);
  const [fileName, setFileName] = useState('');

  const bulkUploadMutation = useMutation({
    mutationFn: inventoryService.bulkUpload,
    onSuccess: (uploadResult) => {
      setResult(uploadResult);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      showToast(
        `Bulk upload complete: ${uploadResult.summary.totalCreated} created, ${uploadResult.summary.totalSkipped} skipped`,
        'success',
      );
    },
    onError: (error: any) => {
      showToast(
        error?.response?.data?.message ?? 'Failed to upload bulk data',
        'error',
      );
    },
  });

  const totalErrors = useMemo(() => {
    if (!result) {
      return 0;
    }

    return (
      result.categories.errors.length +
      result.products.errors.length +
      result.inventory.errors.length
    );
  }, [result]);

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setFileName(file.name);
    setResult(null);
    bulkUploadMutation.mutate(file);
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box>
            <Typography variant="h5">Bulk Upload</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Upload categories, products, and opening stock together from one sheet.
            </Typography>
          </Box>

          <Button component={Link} href="/inventory" variant="text">
            Back to Inventory
          </Button>
        </Box>

        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Upload File</Typography>

              <Typography variant="body2" color="text.secondary">
                Your current format is supported. You can upload one Excel or CSV sheet with
                headers like <strong>Product Name</strong>, <strong>Category</strong>,
                {' '}<strong>Brand</strong>, <strong>Unit</strong>, <strong>Cost Price</strong>,
                {' '}<strong>MRP</strong>, <strong>Selling Price</strong>, and
                {' '}<strong>Stock Qty</strong>.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  component="label"
                  variant="contained"
                  disabled={bulkUploadMutation.isPending}
                >
                  {bulkUploadMutation.isPending ? 'Uploading...' : 'Choose File'}
                  <input
                    hidden
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleUpload}
                  />
                </Button>

                <Button component={Link} href="/inventory" variant="outlined">
                  Cancel
                </Button>
              </Stack>

              {fileName ? (
                <Typography variant="body2" color="text.secondary">
                  Selected file: {fileName}
                </Typography>
              ) : null}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6">Expected Columns</Typography>
              <Typography variant="body2" color="text.secondary">
                Supported single-sheet headers include: Product Name, Category, Brand, Unit,
                Cost Price, MRP, Selling Price, and Stock Qty.
              </Typography>
              <Divider />
              <Typography variant="body2">
                Category will be auto-created from the Category column when missing.
              </Typography>
              <Typography variant="body2">
                Product rows need: Product Name, Category, Cost Price, and either Selling Price or MRP.
              </Typography>
              <Typography variant="body2">
                Stock will be initialized from Stock Qty after the product is created.
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {result ? (
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Upload Summary</Typography>

                <Alert severity={totalErrors > 0 ? 'warning' : 'success'}>
                  {result.summary.totalCreated} records processed successfully and{' '}
                  {result.summary.totalSkipped} skipped.
                </Alert>

                {sectionMeta.map((section) => {
                  const sectionResult = result[section.key];
                  const successCount =
                    'initialized' in sectionResult
                      ? sectionResult.initialized
                      : sectionResult.created;

                  return (
                    <Box key={section.key}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {section.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Rows: {sectionResult.totalRows} | {section.successLabel}: {successCount} |
                        {' '}Skipped: {sectionResult.skipped}
                      </Typography>

                      {sectionResult.errors.length > 0 ? (
                        <Stack spacing={0.5} sx={{ mt: 1 }}>
                          {sectionResult.errors.slice(0, 5).map((errorMessage) => (
                            <Typography
                              key={`${section.key}-${errorMessage}`}
                              variant="body2"
                              color="error.main"
                            >
                              {errorMessage}
                            </Typography>
                          ))}
                        </Stack>
                      ) : null}
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </Stack>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}