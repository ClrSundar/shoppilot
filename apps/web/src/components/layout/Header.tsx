'use client';

import { useRouter } from 'next/navigation';

type HeaderProps = {
  onMenuClick: () => void;
};

const quickActions = [
  { label: 'Create Quote', href: '/quotes/new' },
  { label: 'Record Payment', href: '/payments' },
  { label: 'Add Customer', href: '/customers' },
  { label: 'Check Stock', href: '/inventory' },
] as const;

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
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

        <div
          className="hidden md:flex"
          style={{
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => router.push(action.href)}
              style={{
                border: '1px solid rgba(148, 163, 184, 0.28)',
                background: '#f8fafc',
                color: '#0f172a',
                borderRadius: 12,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

    </header>
  );
}