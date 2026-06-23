'use client';

import Link from 'next/link';

export function Sidebar() {
  return (
    <div
      style={{
        width: 240,
        background: '#f4f4f4',
        padding: 20,
      }}
    >
      <h2>ShopPilot</h2>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li><Link href="/dashboard">Dashboard</Link></li>
        <li><Link href="/categories">Categories</Link></li>
        <li><Link href="/products">Products</Link></li>
        <li><Link href="/customers">Customers</Link></li>
        <li><Link href="/quotes">Quotes</Link></li>
        <li><Link href="/team">Team</Link></li>
      </ul>
    </div>
  );
}