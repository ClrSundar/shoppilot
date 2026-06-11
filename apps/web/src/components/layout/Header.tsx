'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export function Header() {
  const router = useRouter();

  const logout = useAuthStore(
    (state) => state.logout,
  );

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div
      style={{
        height: 60,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 20px',
        borderBottom: '1px solid #ddd',
      }}
    >
      <button onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}