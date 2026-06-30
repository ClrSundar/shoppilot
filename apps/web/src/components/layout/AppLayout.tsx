'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

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
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 8px 18px rgba(15, 23, 42, 0.08)',
                }}
              >
                <span style={{ fontSize: 16 }}>↩</span>
                <span>Logout</span>
              </button>
            </div>

            <div
              style={{
                minHeight: 'calc(100vh - 92px)',
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