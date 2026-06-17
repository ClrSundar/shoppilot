import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AuthState = {
  token: string | null;
  isHydrated: boolean;
  setToken: (token: string) => void;
  logout: () => void;
  setIsHydrated: (hydrated: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      isHydrated: false,

      setToken: (token) => set({ token }),

      logout: () => set({ token: null }),

      setIsHydrated: (hydrated) => set({ isHydrated: hydrated }),
    }),
    {
      name: 'shoppilot-auth',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setIsHydrated(true);
        }
      },
    },
  ),
);