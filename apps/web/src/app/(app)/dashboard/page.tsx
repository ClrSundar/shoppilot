'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
  Alert,
  AlertTitle,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { WarningAmber } from '@mui/icons-material';

import { dashboardService } from '@/services/dashboard.service';

const cards = [
  {
    key: 'categories',
    label: 'Categories',
    description: 'Organize your catalog structure',
    href: '/categories',
    icon: '/window.svg',
  },
  {
    key: 'products',
    label: 'Products',
    description: 'Manage pricing and availability',
    href: '/products',
    icon: '/next.svg',
  },
  {
    key: 'customers',
    label: 'Customers',
    description: 'Track relationships and follow-ups',
    href: '/customers',
    icon: '/globe.svg',
  },
  {
    key: 'quotes',
    label: 'Quotes',
    description: 'Create, send, and close quotes',
    href: '/quotes',
    icon: '/file.svg',
  },
] as const;

const quickActions = [
  { label: 'Add Product', href: '/products' },
  { label: 'Add Customer', href: '/customers' },
  { label: 'Create Quote', href: '/quotes' },
  { label: 'Check Inventory', href: '/inventory' },
];

export default function Dashboard() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: dashboardService.getMetrics,
  });

  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: dashboardService.getLowStockProducts,
  });

  return (
    <Box>
      <Card
        sx={{
          mb: 3,
          borderRadius: 3,
          background:
            'linear-gradient(135deg, rgba(11, 27, 58, 1) 0%, rgba(20, 72, 117, 1) 60%, rgba(29, 114, 142, 1) 100%)',
          color: 'common.white',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Grid container spacing={2} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack spacing={1.5}>
                <Chip
                  label="Shop Owner Snapshot"
                  sx={{
                    alignSelf: 'flex-start',
                    bgcolor: alpha('#FFFFFF', 0.15),
                    color: 'common.white',
                    fontWeight: 600,
                  }}
                />

                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  Welcome back, ready to run today&apos;s business?
                </Typography>

                <Typography sx={{ color: alpha('#FFFFFF', 0.9) }}>
                  Jump into catalog updates, customer follow-ups, and quote workflows in one click.
                </Typography>

                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  {quickActions.map((action) => (
                    <Button
                      key={action.label}
                      variant="contained"
                      size="small"
                      onClick={() => router.push(action.href)}
                      sx={{
                        bgcolor: alpha('#FFFFFF', 0.15),
                        '&:hover': { bgcolor: alpha('#FFFFFF', 0.25) },
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: { xs: 'flex-start', md: 'center' },
                }}
              >
                <Box
                  sx={{
                    width: 120,
                    height: 120,
                    borderRadius: '50%',
                    bgcolor: alpha('#FFFFFF', 0.12),
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Image src="/vercel.svg" alt="Dashboard visual" width={64} height={64} />
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {lowStockProducts.length > 0 && (
        <Alert
          severity={
            lowStockProducts.some((p) => p.status === 'OUT_OF_STOCK')
              ? 'error'
              : 'warning'
          }
          icon={<WarningAmber />}
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => router.push('/inventory')}
            >
              View Inventory
            </Button>
          }
        >
          <AlertTitle>
            {lowStockProducts.filter((p) => p.status === 'OUT_OF_STOCK').length > 0
              ? 'Out of Stock Alert!'
              : 'Low Stock Alert'}
          </AlertTitle>
          <Stack spacing={0.5}>
            {lowStockProducts.map((product) => (
              <Typography key={product.id} variant="body2">
                {product.status === 'OUT_OF_STOCK' ? '🔴' : '🟡'} {product.productName}
                {product.sku && ` (${product.sku})`} — On hand: {product.onHand}/{
                  product.reorderLevel
                }
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      <Typography variant="h5" sx={{ mb: 2 }}>
        Business Modules
      </Typography>

      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid key={card.key} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              onClick={() => router.push(card.href)}
              sx={{
                cursor: 'pointer',
                borderRadius: 3,
                transition: 'transform 160ms ease, box-shadow 160ms ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
            >
              <CardContent>
                <Stack direction="row" spacing={1.2} sx={{ alignItems: 'center', mb: 1 }}>
                  <Image src={card.icon} alt={card.label} width={24} height={24} />
                  <Typography color="text.secondary">{card.label}</Typography>
                </Stack>

                <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {isLoading ? '-' : data?.[card.key] ?? 0}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  {card.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}