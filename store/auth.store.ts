import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AuthUser } from '@/types/auth';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,

      setUser: (user) =>
        set({ user, isAuthenticated: !!user, isLoading: false }),

      setLoading: (isLoading) => set({ isLoading }),

      logout: () =>
        set({ user: null, isAuthenticated: false, isLoading: false }),
    }),
    { name: 'auth-store' }
  )
);
