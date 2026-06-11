'use client';

import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  tenant: {
    id: string;
    name: string;
    code: string;
    businessType: string;
  };
};


export default function Dashboard() {
  const [me, setMe] = useState<CurrentUser | null>(null);

  useEffect(() => {
    api.get<CurrentUser>('/auth/me').then((res) => {
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