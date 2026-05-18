import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  setTokens: (a: string, r: string, email?: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      email: null,
      setTokens: (a, r, email) => set({ accessToken: a, refreshToken: r, email: email ?? null }),
      logout: () => set({ accessToken: null, refreshToken: null, email: null }),
    }),
    { name: 'mcc-auth' },
  ),
);
