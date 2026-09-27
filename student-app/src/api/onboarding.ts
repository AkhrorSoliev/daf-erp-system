import { api } from './client';
import type { OnboardingStatus } from './types';

// First-run steps (ADR-0039). Every write answers with the new status, which
// the screen puts straight into the `onboardingKey` cache.

/** POST /api/student-portal/onboarding/phone/send-code — SMS to the card's own number. */
export async function sendPhoneCode(): Promise<{ resendInSec: number }> {
  const { data } = await api.post('/student-portal/onboarding/phone/send-code');
  return { resendInSec: Number(data?.resendInSec) || 60 };
}

/** POST /api/student-portal/onboarding/phone/verify */
export async function verifyPhoneCode(code: string): Promise<OnboardingStatus> {
  const { data } = await api.post<OnboardingStatus>('/student-portal/onboarding/phone/verify', { code });
  return data;
}

/** PATCH /api/student-portal/onboarding/profile — only the fields still missing. */
export async function updateOnboardingProfile(body: {
  gender?: 'MALE' | 'FEMALE';
  dateOfBirth?: string;
}): Promise<OnboardingStatus> {
  const { data } = await api.patch<OnboardingStatus>('/student-portal/onboarding/profile', body);
  return data;
}

/**
 * POST /api/student-portal/onboarding/phone/change-code — «Yo'q, boshqa raqam».
 * The code goes to `phone`; a correct code then replaces the card's number.
 * Needs the current password (a sign-in key changes only with it).
 */
export async function sendChangeCode(phone: string, currentPassword: string): Promise<{ resendInSec: number }> {
  const { data } = await api.post('/student-portal/onboarding/phone/change-code', { phone, currentPassword });
  return { resendInSec: Number(data?.resendInSec) || 60 };
}
