'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { authService, TenantOption } from '@/services/auth.service';

export default function LoginPage() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);

  const [email, setEmail] = useState('admin@sundar.com');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState<TenantOption[] | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setError('');
      setLoading(true);

      const response = await authService.login({
        email,
        password,
        tenantId: selectedTenantId || undefined,
      });

      // If response has tenants, show selector
      if ('tenants' in response && response.tenants) {
        setTenants(response.tenants);
        setSelectedTenantId(''); // Reset selection
        return;
      }

      // If response has token, save and redirect
      if ('accessToken' in response && response.accessToken) {
        setToken(response.accessToken);
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Invalid email or password');
      setTenants(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTenantSelect = async () => {
    if (!selectedTenantId) {
      setError('Please select a shop');
      return;
    }

    try {
      setError('');
      setLoading(true);

      const response = await authService.login({
        email,
        password,
        tenantId: selectedTenantId,
      });

      if ('accessToken' in response && response.accessToken) {
        setToken(response.accessToken);
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Failed to login to selected shop');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
        bgcolor: '#f6f8fb',
      }}
    >
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          p: 8,
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)',
          color: 'white',
        }}
      >
        <Typography variant="h3" sx={{ mb: 2, fontWeight: 800 }}>
          ShopPilot
        </Typography>

        <Typography variant="h5" sx={{ mb: 3, opacity: 0.95 }}>
          Smart quotations for modern retail stores.
        </Typography>

        <Typography sx={{ maxWidth: 520, opacity: 0.85, lineHeight: 1.8 }}>
          Manage products, customers, quotations and invoices from one clean
          dashboard. Built for electrical, plumbing and motor businesses.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Card
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 4,
            boxShadow: '0 20px 60px rgba(15, 23, 42, 0.12)',
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
              {tenants ? 'Select your shop' : 'Welcome back'}
            </Typography>

            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {tenants
                ? 'Multiple shops found. Choose which one to access.'
                : 'Login to continue to ShopPilot'}
            </Typography>

            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}

              {!tenants ? (
                <>
                  <TextField
                    label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    fullWidth
                  />

                  <TextField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    fullWidth
                  />

                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleLogin}
                    disabled={!email || !password || loading}
                    sx={{
                      py: 1.3,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    {loading ? 'Logging in...' : 'Login'}
                  </Button>

                  <Button
                    onClick={() => router.push('/register')}
                    sx={{ textTransform: 'none' }}
                  >
                    New to ShopPilot? Register your shop
                  </Button>
                </>
              ) : (
                <>
                  <Select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    displayEmpty
                    fullWidth
                  >
                    <MenuItem value="">
                      <em>Select a shop...</em>
                    </MenuItem>
                    {tenants.map((tenant) => (
                      <MenuItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </MenuItem>
                    ))}
                  </Select>

                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleTenantSelect}
                    disabled={!selectedTenantId || loading}
                    sx={{
                      py: 1.3,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    {loading ? 'Logging in...' : 'Continue'}
                  </Button>

                  <Button
                    onClick={() => {
                      setTenants(null);
                      setSelectedTenantId('');
                      setError('');
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Login with different email
                  </Button>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}