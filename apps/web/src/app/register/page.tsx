'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';

import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

export default function RegisterPage() {
  const router = useRouter();
  const setToken = useAuthStore((state) => state.setToken);

  const [shopName, setShopName] = useState('');
  const [shopCode, setShopCode] = useState('');
  const [businessType, setBusinessType] = useState<'ELECTRICAL' | 'PLUMBING' | 'MOTOR' | 'GENERAL'>('GENERAL');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = async () => {
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
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#f5f5f5',
      }}
    >
      <Paper sx={{ p: 4, width: 420 }}>
        <Typography variant="h5" sx={{ mb: 3 }}>
          Register ShopPilot
        </Typography>

        <Stack spacing={2}>
          <TextField label="Shop Name" value={shopName} onChange={(e) => setShopName(e.target.value)} fullWidth />

          <TextField label="Shop Code" value={shopCode} onChange={(e) => setShopCode(e.target.value)} fullWidth />

          <TextField select label="Business Type" value={businessType} onChange={(e) => setBusinessType(e.target.value as typeof businessType)} fullWidth>
            <MenuItem value="ELECTRICAL">Electrical</MenuItem>
            <MenuItem value="PLUMBING">Plumbing</MenuItem>
            <MenuItem value="MOTOR">Motor</MenuItem>
            <MenuItem value="GENERAL">General</MenuItem>
          </TextField>

          <TextField label="Owner Name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} fullWidth />

          <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />

          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />

          <Button
            variant="contained"
            onClick={handleRegister}
            disabled={!shopName || !shopCode || !ownerName || !email || !password}
          >
            Register
          </Button>

          <Button onClick={() => router.push('/login')}>
            Already have an account? Login
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}