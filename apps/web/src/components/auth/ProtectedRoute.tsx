'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  useEffect(() => {
    // Only check auth after store has hydrated from localStorage
    if (isHydrated && !token) {
      router.replace('/login');
    }
  }, [token, isHydrated, router]);

  // Don't render anything until hydration is complete
  if (!isHydrated) return null;

  // Don't render children if no token
  if (!token) return null;

  return <>{children}</>;
}