'use client';

import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { dashboardService } from '@/services/dashboard.service';

const cards = [
  { key: 'categories', label: 'Categories' },
  { key: 'products', label: 'Products' },
  { key: 'customers', label: 'Customers' },
  { key: 'quotes', label: 'Quotes' },
] as const;

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: dashboardService.getMetrics,
  });

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Dashboard
      </Typography>

      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid key={card.key} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary">{card.label}</Typography>

                <Typography variant="h4">
                  {isLoading ? '-' : data?.[card.key] ?? 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}