'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

type HeaderProps = {
  onMenuClick: () => void;
};

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();

  const logout = useAuthStore(
    (state) => state.logout,
  );

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
        borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
        background: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
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
            background: 'rgba(30, 41, 59, 0.92)',
            color: '#f8fafc',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>☰</span>
        </button>

        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#f8fafc', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            ShopPilot
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>
            Inventory, quotes, and customers in one place
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
          padding: '10px 14px',
          borderRadius: 14,
          border: '1px solid rgba(248, 250, 252, 0.14)',
          background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.12), rgba(59, 130, 246, 0.16))',
          color: '#f8fafc',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)',
        }}
      >
        <span style={{ fontSize: 16 }}>↩</span>
        <span className="hidden sm:inline">Logout</span>
      </button>
    </header>
  );
}