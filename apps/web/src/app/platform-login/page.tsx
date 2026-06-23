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
import { platformAuthService } from '@/services/platform.service';

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setError('');
      setLoading(true);
      const res = await platformAuthService.login({ email, password });
      localStorage.setItem('platform_token', res.accessToken);
      router.push('/platform/tenants');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#0f172a',
      }}
    >
      <Card
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 4,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 800 }}>
            ShopPilot
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Platform Admin Console
          </Typography>

          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Admin Email"
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
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
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
                bgcolor: '#2563eb',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In as Admin'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
