import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS = 'daf.accessToken';
const REFRESH = 'daf.refreshToken';

// expo-secure-store has no web implementation; fall back to localStorage for the
// browser dev preview only. On iOS/Android tokens live in Keychain / Keystore.
const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  return SecureStore.getItemAsync(key);
}
async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const secureStorage = {
  getAccessToken: () => getItem(ACCESS),
  getRefreshToken: () => getItem(REFRESH),
  async setTokens(access: string, refresh: string) {
    await setItem(ACCESS, access);
    await setItem(REFRESH, refresh);
  },
  async clear() {
    await removeItem(ACCESS);
    await removeItem(REFRESH);
  },
};
