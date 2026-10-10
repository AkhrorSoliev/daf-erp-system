import type { TaskPriority } from '@prisma/client';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../common/date/tashkent';

/** Spec 2026-10-07 §6.4: nothing reaches Telegram 22:00–08:00 Asia/Tashkent. */
const QUIET_FROM_MIN = 22 * 60;
const QUIET_UNTIL_MIN = 8 * 60;

/** `at`, or the next 08:00 Tashkent when `at` falls in the quiet hours. */
export function afterQuietHours(at: Date): Date {
  const day = tashkentDateStr(at);
  const minute = Math.floor(
    (at.getTime() - tashkentDayStartUtc(day).getTime()) / 60_000,
  );
  if (minute >= QUIET_UNTIL_MIN && minute < QUIET_FROM_MIN) return at;
  const morning = minute < QUIET_UNTIL_MIN ? day : addDaysToDateStr(day, 1);
  return new Date(
    tashkentDayStartUtc(morning).getTime() + QUIET_UNTIL_MIN * 60_000,
  );
}

/** When a Telegram notice ready at `at` may go out; an URGENT task's never waits. */
export function telegramSendAfter(at: Date, priority: TaskPriority): Date {
  return priority === 'URGENT' ? at : afterQuietHours(at);
}
