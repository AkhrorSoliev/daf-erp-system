import { api } from './client';

export type LoginResponse = { accessToken: string; refreshToken: string };

/** POST /api/auth/login — student logs in with phone (raw, as typed) + password; the server normalizes the identifier. */
export async function login(phone: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post('/auth/login', { login: phone, password });
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

export type PollResult = { status: 'pending' } | ({ status: 'approved' } & LoginResponse);

/** GET /api/auth/otp/poll — poll a link-based login request until the bot approves it. */
export async function pollLoginRequest(requestId: string): Promise<PollResult> {
  const { data } = await api.get('/auth/otp/poll', { params: { requestId } });
  if (data?.status === 'approved') {
    return { status: 'approved', accessToken: data.accessToken, refreshToken: data.refreshToken };
  }
  return { status: 'pending' };
}

// ── SMS "forgot password" (Eskiz OTP) ──────────────────────────────────────
/** Step 1: request a 4-digit SMS code. Always resolves (anti-enumeration). */
export async function requestPasswordReset(phone: string): Promise<void> {
  await api.post('/auth/forgot-password/request', { phone });
}

/** Step 2: verify the code → single-use reset token. */
export async function verifyResetCode(
  phone: string,
  code: string,
): Promise<{ resetToken: string }> {
  const { data } = await api.post('/auth/forgot-password/verify', { phone, code });
  return { resetToken: data.resetToken };
}

/** Step 3: set the new password with the reset token. */
export async function resetPasswordWithToken(
  resetToken: string,
  newPassword: string,
): Promise<void> {
  await api.post('/auth/forgot-password/reset', { resetToken, newPassword });
}
