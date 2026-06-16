import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import { secureStorage } from '@/auth/secure-storage';
import { useAuth } from '@/auth/auth-store';

/**
 * Axios instance for the student API.
 * X-Portal: student -> backend native role-gate (MUST-HAVE #1); replaces the
 * browser Origin check the web portal relies on. Backend must map this header to
 * role-id 6 in portal-roles.config.ts before launch.
 */
export const api = axios.create({
  baseURL: env.apiUrl,
  timeout: 20_000,
  headers: { 'X-Portal': 'student' },
});

api.interceptors.request.use(async (config) => {
  const token = await secureStorage.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single in-flight refresh shared across concurrent 401s.
let refreshing: Promise<string | null> | null = null;

async function refreshTokens(): Promise<string | null> {
  const refreshToken = await secureStorage.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${env.apiUrl}/auth/refresh`, { refreshToken });
    await secureStorage.setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing ??= refreshTokens().finally(() => {
        refreshing = null;
      });
      const newToken = await refreshing;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      await useAuth.getState().signOut();
    }
    return Promise.reject(error);
  },
);
