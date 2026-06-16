import { api } from './client';

export type LoginResponse = { accessToken: string; refreshToken: string };

/** POST /api/auth/login — student logs in with phone (9-digit) + password. */
export async function login(phone: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post('/auth/login', { login: phone, password });
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

/** POST /api/auth/otp/exchange — exchange a Telegram bot login code for a session. */
export async function exchangeOtp(code: string): Promise<LoginResponse> {
  const { data } = await api.post('/auth/otp/exchange', { code });
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}
