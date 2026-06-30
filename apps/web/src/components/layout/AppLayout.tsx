'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <ProtectedRoute>
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Sidebar
            isMobileOpen={isMobileNavOpen}
            onNavigate={() => setIsMobileNavOpen(false)}
            onClose={() => setIsMobileNavOpen(false)}
          />

          <div style={{ flex: 1, minWidth: 0, padding: 20 }}>
            <div
              style={{
                minHeight: 'calc(100vh - 40px)',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 28,
                overflow: 'hidden',
                background: '#ffffff',
                border: '1px solid rgba(148, 163, 184, 0.22)',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.08)',
              }}
            >
              <Header onMenuClick={() => setIsMobileNavOpen(true)} />

              <main style={{ flex: 1, padding: 20 }}>
                {children}
              </main>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}