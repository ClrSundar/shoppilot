'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppToast } from '@/components/common/AppToast';
import { useAppToast } from '@/hooks/use-app-toast';
import {
  tenantSettingsService,
  type AgentDiscountConfigItem,
} from '@/services/tenant-settings.service';
import { usersService } from '@/services/users.service';

export default function AgentTypeSettingsPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, closeToast } = useAppToast();

  const [draftItems, setDraftItems] = useState<AgentDiscountConfigItem[]>([]);

  const { data: me } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: usersService.getMe,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-settings', 'agent-discounts'],
    queryFn: tenantSettingsService.getAgentDiscountConfig,
  });

  const isOwner = me?.role === 'OWNER';

  const displayedItems = useMemo(() => {
    if (draftItems.length > 0) {
      return draftItems;
    }

    return data?.items ?? [];
  }, [data?.items, draftItems]);

  const updateMutation = useMutation({
    mutationFn: tenantSettingsService.updateAgentDiscountConfig,
    onSuccess: (res) => {
      setDraftItems(res.items);
      queryClient.invalidateQueries({
        queryKey: ['tenant-settings', 'agent-discounts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['quotes'],
      });
      showToast('Agent type discounts saved successfully', 'success');
    },
    onError: (err: any) => {
      showToast(
        err?.response?.data?.message ??
          'Failed to save agent type discounts',
        'error',
      );
    },
  });

  const handlePercentageChange = (category: string, value: string) => {
    const parsed = Number(value);

    setDraftItems((previous) => {
      const source = previous.length > 0 ? previous : data?.items ?? [];

      return source.map((item) => {
        if (item.category !== category) {
          return item;
        }

        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          return item;
        }

        return {
          ...item,
          defaultDiscountPercentage: Number(parsed.toFixed(2)),
        };
      });
    });
  };

  const handleSave = () => {
    if (!isOwner) {
      showToast('Only shop owner can update this configuration', 'error');
      return;
    }

    const source = draftItems.length > 0 ? draftItems : data?.items ?? [];

    updateMutation.mutate(source);
  };

  return (
    <Box>
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Agent Type Discounts
        </Typography>

        <Typography color="text.secondary" variant="body2">
          Shop owner can configure default discount percentages by agent type.
          These defaults are auto-applied in quote creation and can still be
          overridden per quote.
        </Typography>

        {!isOwner && (
          <Alert severity="warning">
            You can view this configuration, but only OWNER can edit and save.
          </Alert>
        )}
      </Stack>

      <Stack spacing={2}>
        {displayedItems.map((item) => (
          <Stack
            key={item.category}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'center' } }}
          >
            <TextField
              label="Agent Type"
              value={item.label}
              fullWidth
              slotProps={{
                input: {
                  readOnly: true,
                },
              }}
            />

            <TextField
              label="Default Discount %"
              type="number"
              value={item.defaultDiscountPercentage}
              onChange={(e) =>
                handlePercentageChange(item.category, e.target.value)
              }
              slotProps={{
                htmlInput: {
                  min: 0,
                  max: 100,
                  step: 0.01,
                },
              }}
              disabled={!isOwner}
              sx={{ width: { sm: 220 } }}
            />
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!isOwner || isLoading || updateMutation.isPending}
        >
          Save Configuration
        </Button>

        <Button
          variant="outlined"
          onClick={() => setDraftItems(data?.items ?? [])}
          disabled={isLoading}
        >
          Reset
        </Button>
      </Stack>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
