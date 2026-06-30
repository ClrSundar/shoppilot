'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  return (
    <ProtectedRoute>
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #020617 0%, #0f172a 45%, #e2e8f0 45%, #f8fafc 100%)' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Sidebar
            isMobileOpen={isMobileNavOpen}
            onNavigate={() => setIsMobileNavOpen(false)}
            onClose={() => setIsMobileNavOpen(false)}
          />

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Header onMenuClick={() => setIsMobileNavOpen(true)} />

            <main style={{ flex: 1, padding: 20 }}>
              <div
                style={{
                  minHeight: 'calc(100vh - 112px)',
                  borderRadius: 28,
                  padding: 20,
                  background: 'rgba(248, 250, 252, 0.92)',
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  boxShadow: '0 24px 80px rgba(15, 23, 42, 0.08)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                }}
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}