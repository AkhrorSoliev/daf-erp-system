import { create } from 'zustand';
import { secureStorage } from './secure-storage';

export type StudentUser = {
  id: number;
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  photo?: string | null;
  balance: number;
};

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthState = {
  status: AuthStatus;
  user: StudentUser | null;
  /** Read tokens from secure storage on launch. */
  hydrate: () => Promise<void>;
  /** Persist a new session (after OTP exchange / login). */
  setSession: (user: StudentUser, accessToken: string, refreshToken: string) => Promise<void>;
  setUser: (user: StudentUser) => void;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  hydrate: async () => {
    const token = await secureStorage.getAccessToken();
    set({ status: token ? 'authenticated' : 'unauthenticated' });
    // Phase 1: validate token + fetch profile via TanStack Query; sign out on 401.
  },
  setSession: async (user, accessToken, refreshToken) => {
    await secureStorage.setTokens(accessToken, refreshToken);
    set({ user, status: 'authenticated' });
  },
  setUser: (user) => set({ user }),
  signOut: async () => {
    await secureStorage.clear();
    set({ user: null, status: 'unauthenticated' });
  },
}));
