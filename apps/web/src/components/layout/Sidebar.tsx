'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

type SidebarProps = {
  isMobileOpen: boolean;
  onNavigate: () => void;
  onClose: () => void;
};

const navigationItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { href: '/quotes', label: 'Quotes', icon: '✎' },
];

const moreNavigationGroups = [
  {
    title: 'Operations',
    items: [
      { href: '/customers', label: 'Customers', icon: '☺' },
      { href: '/payments', label: 'Payments', icon: '$' },
      { href: '/inventory', label: 'Inventory', icon: '◌' },
      { href: '/inventory/bulk-upload', label: 'Bulk Upload', icon: '⇪' },
      { href: '/returns', label: 'Returns', icon: 'RT' },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { href: '/products', label: 'Products', icon: '▦' },
      { href: '/categories', label: 'Categories', icon: '◫' },
      { href: '/suppliers', label: 'Suppliers', icon: 'SV' },
      { href: '/purchases', label: 'Purchases', icon: 'PO' },
    ],
  },
  {
    title: 'People & Settings',
    items: [
      { href: '/agents', label: 'Agents', icon: '♢' },
      { href: '/settings/agent-types', label: 'Agent Types', icon: '⚙' },
      { href: '/team', label: 'Team', icon: '⟡' },
      { href: '/billing', label: 'Billing', icon: '$' },
      { href: '/copilot', label: 'Copilot', icon: '⚑' },
      { href: '/recommendations-history', label: 'Recommendations', icon: '⋯' },
    ],
  },
] as const;

export function Sidebar({ isMobileOpen, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    onClose();
    logout();
    router.push('/login');
  };

  const sidebarShellStyle = {
    width: 288,
    flexShrink: 0,
    padding: 16,
    background:
      'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.98))',
    color: '#e2e8f0',
  };

  return (
    <>
      {isMobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.56)',
            border: 'none',
            zIndex: 39,
          }}
        />
      ) : null}

      <aside
        style={{
          ...sidebarShellStyle,
          position: 'fixed',
          inset: 0,
          height: '100dvh',
          overflow: 'hidden',
          zIndex: 40,
          transform: isMobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 220ms ease',
          boxShadow: '24px 0 48px rgba(15, 23, 42, 0.24)',
        }}
        className="md:hidden"
      >
        <SidebarContent
          pathname={pathname}
          onNavigate={onNavigate}
          onClose={onClose}
          onLogout={handleLogout}
        />
      </aside>

      <aside
        style={sidebarShellStyle}
        className="hidden md:flex md:flex-col md:min-h-screen md:sticky md:top-0 md:border-r md:border-slate-700/60"
      >
        <SidebarContent
          pathname={pathname}
          onNavigate={onNavigate}
          onClose={onClose}
          onLogout={handleLogout}
        />
      </aside>
    </>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
  onClose,
  onLogout,
}: {
  pathname: string;
  onNavigate: () => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  const isMoreActive = useMemo(
    () =>
      moreNavigationGroups.some((group) =>
        group.items.some(
          (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
        ),
      ),
    [pathname],
  );

  const [isMoreOpen, setIsMoreOpen] = useState(isMoreActive);

  useEffect(() => {
    if (isMoreActive) {
      setIsMoreOpen(true);
    }
  }, [isMoreActive]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        gap: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: '#f8fafc',
            }}
          >
            ShopPilot
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
            Selling made organized
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="md:hidden"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.22)',
            background: 'rgba(30, 41, 59, 0.92)',
            color: '#f8fafc',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          const label = item.href === '/dashboard' ? 'Home' : 'Sell';

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 14,
                border: isActive
                  ? '1px solid rgba(96, 165, 250, 0.4)'
                  : '1px solid transparent',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.26), rgba(14, 165, 233, 0.14))'
                  : 'transparent',
                color: isActive ? '#f8fafc' : '#cbd5e1',
                textDecoration: 'none',
                fontWeight: 600,
                boxShadow: isActive
                  ? '0 12px 24px rgba(15, 23, 42, 0.22)'
                  : 'none',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive
                    ? 'rgba(248, 250, 252, 0.14)'
                    : 'rgba(148, 163, 184, 0.12)',
                  color: isActive ? '#f8fafc' : '#94a3b8',
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setIsMoreOpen((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 14,
            border: isMoreActive
              ? '1px solid rgba(96, 165, 250, 0.4)'
              : '1px solid transparent',
            background: isMoreActive
              ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.26), rgba(14, 165, 233, 0.14))'
              : 'transparent',
            color: isMoreActive ? '#f8fafc' : '#cbd5e1',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isMoreActive
                ? 'rgba(248, 250, 252, 0.14)'
                : 'rgba(148, 163, 184, 0.12)',
              color: isMoreActive ? '#f8fafc' : '#94a3b8',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ≡
          </span>
          <span style={{ flex: 1, textAlign: 'left' }}>More</span>
          <span aria-hidden="true" style={{ fontSize: 12, opacity: 0.9 }}>
            {isMoreOpen ? '▴' : '▾'}
          </span>
        </button>

        {isMoreOpen ? (
          <div
            style={{
              marginTop: 6,
              padding: 10,
              borderRadius: 14,
              border: '1px solid rgba(148, 163, 184, 0.18)',
              background: 'rgba(15, 23, 42, 0.32)',
              display: 'grid',
              gap: 10,
            }}
          >
            {moreNavigationGroups.map((group) => (
              <div key={group.title} style={{ display: 'grid', gap: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#94a3b8',
                    padding: '0 8px',
                  }}
                >
                  {group.title}
                </div>

                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: isActive
                          ? '1px solid rgba(96, 165, 250, 0.36)'
                          : '1px solid transparent',
                        background: isActive
                          ? 'rgba(59, 130, 246, 0.2)'
                          : 'transparent',
                        color: isActive ? '#f8fafc' : '#cbd5e1',
                        textDecoration: 'none',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 20,
                          display: 'inline-flex',
                          justifyContent: 'center',
                          color: isActive ? '#e2e8f0' : '#94a3b8',
                          fontSize: 12,
                        }}
                      >
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </nav>

      <div
        style={{
          marginTop: 'auto',
          padding: 16,
          borderRadius: 20,
          border: '1px solid rgba(148, 163, 184, 0.16)',
          background:
            'linear-gradient(180deg, rgba(15, 23, 42, 0.52), rgba(30, 41, 59, 0.72))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(248, 250, 252, 0.18)',
              color: '#f8fafc',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}
          >
            SP
          </span>

          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>
              Profile
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
              Signed in
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          style={{
            width: '100%',
            marginTop: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.32)',
            background: 'rgba(248, 250, 252, 0.08)',
            color: '#f8fafc',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 16 }}>↩</span>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
