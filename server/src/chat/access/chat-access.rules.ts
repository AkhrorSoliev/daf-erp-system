import type { Gender } from '@prisma/client';
import { addDaysToDateStr } from '../../common/date/tashkent';
import { isPhoneVerified } from '../../students/shared/student-onboarding';

export const WINDOW_DAYS = 7;

export interface DayUsage {
  /** Tashkent calendar day, 'YYYY-MM-DD'. */
  day: string;
  activeSeconds: number;
  radioSeconds: number;
}

export interface Quota {
  activeMin: number;
  radioMin: number;
}

export interface QuotaResult {
  windowDays: typeof WINDOW_DAYS;
  activeMin: number;
  radioMin: number;
  quota: Quota;
  ok: boolean;
  missingActiveMin: number;
  missingRadioMin: number;
  /**
   * Set when the quota holds today but will not tomorrow, once the oldest day
   * leaves the window: what must still be added today to keep it.
   */
  tomorrow: { needActiveMin: number; needRadioMin: number } | null;
}

const minutes = (seconds: number): number => Math.floor(seconds / 60);

/** Days are 'YYYY-MM-DD' strings, so string comparison is calendar comparison. */
function totals(days: DayUsage[], from: string, to: string) {
  let active = 0;
  let radio = 0;
  for (const d of days) {
    if (d.day >= from && d.day <= to) {
      active += d.activeSeconds;
      radio += d.radioSeconds;
    }
  }
  return { activeMin: minutes(active), radioMin: minutes(radio) };
}

export function evaluateQuota(
  days: DayUsage[],
  today: string,
  quota: Quota,
): QuotaResult {
  const now = totals(days, addDaysToDateStr(today, -(WINDOW_DAYS - 1)), today);
  const missingActiveMin = Math.max(0, quota.activeMin - now.activeMin);
  const missingRadioMin = Math.max(0, quota.radioMin - now.radioMin);
  const ok = missingActiveMin === 0 && missingRadioMin === 0;

  let tomorrow: QuotaResult['tomorrow'] = null;
  if (ok) {
    // Tomorrow's window starts one day later and tomorrow itself is still empty.
    const next = totals(
      days,
      addDaysToDateStr(today, -(WINDOW_DAYS - 2)),
      today,
    );
    const needActiveMin = Math.max(0, quota.activeMin - next.activeMin);
    const needRadioMin = Math.max(0, quota.radioMin - next.radioMin);
    if (needActiveMin > 0 || needRadioMin > 0) {
      tomorrow = { needActiveMin, needRadioMin };
    }
  }

  return {
    windowDays: WINDOW_DAYS,
    activeMin: now.activeMin,
    radioMin: now.radioMin,
    quota,
    ok,
    missingActiveMin,
    missingRadioMin,
    tomorrow,
  };
}

export type ChatLockReason =
  | 'BANNED'
  | 'DEBT'
  | 'GENDER'
  | 'BIRTH_DATE'
  | 'PHONE'
  | 'QUOTA';

export interface AccessFacts {
  balance: number;
  gender: Gender | null;
  dateOfBirth: Date | null;
  phone: string;
  verifiedPhone: string | null;
  chatBannedAt: Date | null;
}

export function lockReasons(f: AccessFacts, q: QuotaResult): ChatLockReason[] {
  const reasons: ChatLockReason[] = [];
  if (f.chatBannedAt) reasons.push('BANNED');
  if (f.balance < 0) reasons.push('DEBT');
  if (!f.gender) reasons.push('GENDER');
  if (!f.dateOfBirth) reasons.push('BIRTH_DATE');
  if (!isPhoneVerified({ phone: f.phone, verifiedPhone: f.verifiedPhone })) {
    reasons.push('PHONE');
  }
  if (!q.ok) reasons.push('QUOTA');
  return reasons;
}

/** "18 daqiqa ishlang va 20 daqiqa radio eshiting", leaving out a half that is zero. */
function parts(activeMin: number, radioMin: number): string {
  const out: string[] = [];
  if (activeMin > 0) out.push(`${activeMin} daqiqa ishlang`);
  if (radioMin > 0) out.push(`${radioMin} daqiqa radio eshiting`);
  return out.join(' va ');
}

export function reasonText(reason: ChatLockReason, q: QuotaResult): string {
  switch (reason) {
    case 'BANNED':
      return 'Siz chatdan chiqarilgansiz. Yozish yopiq.';
    case 'DEBT':
      return "Qarzingiz bor. To'lovni amalga oshiring.";
    case 'GENDER':
      return "Profilingizda jinsingizni to'ldiring.";
    case 'BIRTH_DATE':
      return "Profilingizda tug'ilgan sanangizni to'ldiring.";
    case 'PHONE':
      return 'Telefon raqamingizni tasdiqlang.';
    case 'QUOTA':
      return `Ochish uchun yana ${parts(q.missingActiveMin, q.missingRadioMin)}.`;
  }
}

export function tomorrowWarning(q: QuotaResult): string | null {
  if (!q.tomorrow) return null;
  return `Ertaga yozish yopiladi. Bugun yana ${parts(q.tomorrow.needActiveMin, q.tomorrow.needRadioMin)}.`;
}
