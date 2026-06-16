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
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

type BusinessType =
  | 'ELECTRICAL'
  | 'PLUMBING'
  | 'MOTOR'
  | 'GENERAL';

export default function RegisterPage() {
  const router = useRouter();
  const setToken = useAuthStore((state) => state.setToken);

  const [shopName, setShopName] = useState('');
  const [shopCode, setShopCode] = useState('');
  const [businessType, setBusinessType] =
    useState<BusinessType>('GENERAL');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');

  const handleRegister = async () => {
    try {
      setError('');

      const res = await authService.register({
        shopName,
        shopCode,
        businessType,
        ownerName,
        email,
        password,
      });

      setToken(res.accessToken);
      router.push('/dashboard');
    } catch {
      setError('Registration failed. Shop code or email may already exist.');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' },
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
            'linear-gradient(135deg, #0f172a 0%, #065f46 55%, #10b981 100%)',
          color: 'white',
        }}
      >
        <Typography variant="h3" sx={{ mb: 2, fontWeight: 800 }}>
          Start with ShopPilot
        </Typography>

        <Typography variant="h5" sx={{ mb: 3, opacity: 0.95 }}>
          Register your shop and create quotations in minutes.
        </Typography>

        <Typography sx={{ maxWidth: 560, opacity: 0.85, lineHeight: 1.8 }}>
          Built for electrical, plumbing and motor businesses. Manage products,
          customers, quotes and invoices from one simple dashboard.
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
            maxWidth: 520,
            borderRadius: 4,
            boxShadow: '0 20px 60px rgba(15, 23, 42, 0.12)',
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
              Register your shop
            </Typography>

            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Create your ShopPilot workspace
            </Typography>

            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}

              <TextField
                label="Shop Name"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                fullWidth
              />

              <TextField
                label="Shop Code"
                value={shopCode}
                onChange={(e) =>
                  setShopCode(
                    e.target.value
                      .toLowerCase()
                      .replace(/\s+/g, '-'),
                  )
                }
                helperText="Example: sundar-electricals"
                fullWidth
              />

              <TextField
                select
                label="Business Type"
                value={businessType}
                onChange={(e) =>
                  setBusinessType(e.target.value as BusinessType)
                }
                fullWidth
              >
                <MenuItem value="ELECTRICAL">Electrical</MenuItem>
                <MenuItem value="PLUMBING">Plumbing</MenuItem>
                <MenuItem value="MOTOR">Motor</MenuItem>
                <MenuItem value="GENERAL">General</MenuItem>
              </TextField>

              <TextField
                label="Owner Name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                fullWidth
              />

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
                helperText="Minimum 8 characters"
                fullWidth
              />

              <Button
                variant="contained"
                size="large"
                onClick={handleRegister}
                disabled={
                  !shopName ||
                  !shopCode ||
                  !ownerName ||
                  !email ||
                  password.length < 8
                }
                sx={{
                  py: 1.3,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                Register Shop
              </Button>

              <Button
                onClick={() => router.push('/login')}
                sx={{ textTransform: 'none' }}
              >
                Already have an account? Login
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}