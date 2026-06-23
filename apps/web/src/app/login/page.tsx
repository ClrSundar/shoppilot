'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';

export default function LoginPage() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);

  const [email, setEmail] = useState('admin@sundar.com');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setError('');
      setLoading(true);

      const response = await authService.login({ email, password });
      setToken(response.accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (msg?.includes('pending approval')) {
        setError('Your account is pending approval. Please wait for an administrator to activate it.');
      } else if (msg?.includes('suspended')) {
        setError('Your account has been suspended. Please contact support.');
      } else if (msg?.includes('cancelled')) {
        setError('Your account has been cancelled.');
      } else {
        setError('Invalid email or password');
      }
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
              Welcome back
            </Typography>

            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Login to continue to ShopPilot
            </Typography>

            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}

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
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}