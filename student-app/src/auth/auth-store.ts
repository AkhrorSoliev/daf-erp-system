import { create } from 'zustand';
import { secureStorage } from './secure-storage';

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
    const token = await secureStorage.getAccessToken();
    set({ status: token ? 'authenticated' : 'unauthenticated' });
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
