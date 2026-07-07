import { create } from 'zustand';
import { secureStorage } from './secure-storage';
import { observability } from '@/lib/observability';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthState = {
  status: AuthStatus;
  /** Read tokens from secure storage on launch. */
  hydrate: () => Promise<void>;
  /** Persist a new session (after login). */
  signIn: (accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  hydrate: async () => {
    try {
      const token = await secureStorage.getAccessToken();
      set({ status: token ? 'authenticated' : 'unauthenticated' });
    } catch (error) {
      // SecureStore can reject (e.g. Android "could not decrypt" after a
      // reinstall / OS update / changed keystore). Never leave status stuck on
      // 'loading' — that wedges the splash loader forever. Drop the corrupt
      // entry and fall back to the login screen.
      observability.captureError(error, { where: 'auth.hydrate' });
      await secureStorage.clear().catch(() => {});
      set({ status: 'unauthenticated' });
    }
  },
  signIn: async (accessToken, refreshToken) => {
    await secureStorage.setTokens(accessToken, refreshToken);
    set({ status: 'authenticated' });
  },
  signOut: async () => {
    await secureStorage.clear();
    set({ status: 'unauthenticated' });
  },
}));
