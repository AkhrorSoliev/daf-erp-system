import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-mode';

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  hydrate: () => Promise<void>;
};

/** Theme store — persists the user's choice and drives NativeWind's colorScheme. */
export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  setMode: (mode) => {
    set({ mode });
    colorScheme.set(mode);
    SecureStore.setItemAsync(STORAGE_KEY, mode).catch(() => {});
  },
  hydrate: async () => {
    let mode: ThemeMode = 'system';
    try {
      const saved = (await SecureStore.getItemAsync(STORAGE_KEY)) as ThemeMode | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') mode = saved;
    } catch {
      // fall back to system
    }
    set({ mode });
    colorScheme.set(mode);
  },
}));
