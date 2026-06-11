'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar />

        <div style={{ flex: 1 }}>
          <Header />

          <div style={{ padding: 20 }}>
            {children}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}