'use client';

import { AppLayout } from '@/components/layout/AppLayout';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    api.get('/auth/me').then((res) => {
      setMe(res.data);
    });
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h2>Dashboard</h2>

      <pre>{JSON.stringify(me, null, 2)}</pre>
    </div>
  );
}