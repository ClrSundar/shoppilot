'use client';

type HeaderProps = {
  onMenuClick: () => void;
};

export function Header({ onMenuClick }: HeaderProps) {
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

        <div style={{ minWidth: 0 }} className="md:hidden">
          <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            ShopPilot
          </div>
          <div style={{ color: '#64748b', fontSize: 12 }}>
            Inventory, quotes, and customers in one place
          </div>
        </div>
      </div>

    </header>
  );
}