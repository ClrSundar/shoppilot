'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

type HeaderProps = {
  onMenuClick: () => void;
};

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        minHeight: 72,
        padding: '0 20px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.22)',
        background: '#ffffff',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="inline-flex md:hidden"
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 14,
            border: '1px solid rgba(148, 163, 184, 0.22)',
            background: '#f8fafc',
            color: '#0f172a',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>☰</span>
        </button>

        <div style={{ minWidth: 0 }} className="md:hidden">
          <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            ShopPilot
          </div>
          <div style={{ color: '#64748b', fontSize: 12 }}>
            Inventory, quotes, and customers in one place
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 14,
            border: '1px solid rgba(148, 163, 184, 0.24)',
            background: '#f8fafc',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            SP
          </span>

          <div className="hidden sm:block" style={{ lineHeight: 1.1 }}>
            <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 700 }}>
              Profile
            </div>
            <div style={{ color: '#64748b', fontSize: 11 }}>
              Signed in
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
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
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}