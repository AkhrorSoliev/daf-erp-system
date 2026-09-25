/**
 * Jest boundary for the app: the router, layouts, screens and stores run for
 * real; only what leaves the JS runtime is replaced — the network, the
 * Keychain, push registration, and native animation/gesture modules.
 */
import 'react-native-gesture-handler/jestSetup';

import { queryClient } from '@/api/query-client';

// The worklets Babel plugin guards inline styles that read `.value` (e.g. the
// progress bar's `flex: s.value`) with getUseOfValueInStyleWarning, which the
// official mock leaves out ("ADD ME IF NEEDED" in reanimated's mock.ts). The
// function goes on the mock module itself, because expo-router/testing-library
// registers its own jest.mock of reanimated that returns that same module.
require('react-native-reanimated/mock').getUseOfValueInStyleWarning = () => '';
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Keychain / Keystore as an in-memory map, emptied before every test.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// The HTTP boundary. Tests answer it per URL through test/app.tsx `serveApi`.
jest.mock('@/api/client', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

// Push registration asks the OS for permission and calls Expo's push service.
jest.mock('@/lib/push', () => ({ registerForPush: jest.fn() }));

// Fonts come from the app bundle on a device; in Jest there is nothing to load.
// (Covers what the root layout and @expo/vector-icons call.)
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  isLoading: () => false,
  loadAsync: jest.fn(async () => {}),
}));

// moti re-exports react-native's deprecated SafeAreaView at import time, which
// warns once per test file. The app never renders it (Screen uses
// react-native-safe-area-context); every other warning still prints.
const warn = console.warn;
jest.spyOn(console, 'warn').mockImplementation((message?: unknown, ...rest: unknown[]) => {
  if (typeof message === 'string' && message.startsWith('SafeAreaView has been deprecated')) return;
  warn(message, ...rest);
});

// The app retries a failed query once, a second later; tests assert what the
// student sees after a failure, not the retry schedule.
queryClient.setDefaultOptions({
  queries: { ...queryClient.getDefaultOptions().queries, retry: false },
});

beforeEach(() => {
  (require('expo-secure-store').__store as Map<string, string>).clear();
});

afterEach(() => {
  queryClient.clear();
});
