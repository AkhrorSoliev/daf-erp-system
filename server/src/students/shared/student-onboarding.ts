import { Gender } from '@prisma/client';
import { tashkentDateStr } from '../../common/date/tashkent';

/**
 * What a student must give before the portal opens (ADR-0039).
 *
 * The web portal and the native app both gate on `missingOnboardingSteps`
 * through `GET /student-portal/onboarding`, so the rule lives here once and
 * neither client decides for itself what counts as "done".
 */
export type OnboardingStep = 'PHONE' | 'GENDER' | 'BIRTH_DATE';

export interface OnboardingFacts {
  phone: string;
  verifiedPhone: string | null;
  gender: Gender | null;
  dateOfBirth: Date | null;
}

/** Youngest and oldest age a birth date may give — catches a typed year, not a policy. */
export const MIN_STUDENT_AGE = 5;
export const MAX_STUDENT_AGE = 100;

/**
 * Verified means "the number on the card is the number that was proved".
 *
 * Comparing the stored number, not reading a flag, is the whole point: when
 * staff change the card's phone (ADR-0032) nobody has to remember to reset
 * anything — the new number simply is not the proved one.
 */
export function isPhoneVerified(
  s: Pick<OnboardingFacts, 'phone' | 'verifiedPhone'>,
): boolean {
  return !!s.verifiedPhone && s.verifiedPhone === s.phone;
}

/**
 * Only an Uzbek number in the stored 9-digit form can receive our SMS (Eskiz
 * sends to `998` + 9 digits). A foreign number kept with its country code is
 * never asked to verify — asking would lock that student out for good.
 */
export function canVerifyBySms(phone: string | null | undefined): boolean {
  return /^\d{9}$/.test(phone ?? '');
}

export function missingOnboardingSteps(
  s: OnboardingFacts,
  opts: { phoneVerificationEnabled: boolean },
): OnboardingStep[] {
  const steps: OnboardingStep[] = [];
  if (
    opts.phoneVerificationEnabled &&
    canVerifyBySms(s.phone) &&
    !isPhoneVerified(s)
  ) {
    steps.push('PHONE');
  }
  if (!s.gender) steps.push('GENDER');
  if (!s.dateOfBirth) steps.push('BIRTH_DATE');
  return steps;
}

/**
 * Full years between a 'YYYY-MM-DD' birth date and a 'YYYY-MM-DD' today.
 * String arithmetic on purpose: both are calendar dates, and going through
 * `Date` would drag the process timezone in.
 */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/**
 * Why a birth date is refused, or null when it is acceptable. `today` is the
 * Tashkent calendar date; defaulting it keeps the call sites short and the
 * tests explicit.
 */
export function birthDateProblem(
  birthDate: string,
  today: string = tashkentDateStr(new Date()),
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return "Tug'ilgan sana YYYY-MM-DD ko'rinishida bo'lishi kerak";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Round-trip through UTC to reject 2010-02-30 and friends.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return "Tug'ilgan sana noto'g'ri";
  }
  if (birthDate > today) return "Tug'ilgan sana kelajakda bo'lishi mumkin emas";
  const age = ageOn(birthDate, today);
  if (age < MIN_STUDENT_AGE || age > MAX_STUDENT_AGE) {
    return `Yosh ${MIN_STUDENT_AGE} dan ${MAX_STUDENT_AGE} gacha bo'lishi kerak`;
  }
  return null;
}
