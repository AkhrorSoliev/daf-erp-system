import { BadRequestException } from '@nestjs/common';
import type { TaskRecurrenceFreq } from '@prisma/client';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  TASHKENT_OFFSET_MS,
  tashkentDateStr,
  tashkentDayStartUtc,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  buildHolidayDateSet,
  type HolidayDateSetDb,
} from '../holidays/holiday-date-set';

/**
 * Recurring tasks (spec 2026-10-07 §3.6, ADR-0084): when a rule runs. Pure,
 * except `recurrenceHolidays` (one read). Days are Tashkent `YYYY-MM-DD`;
 * weekdays are `getUTCDay()` numbers, 1 = Monday … 6 = Saturday.
 */

export const DEFAULT_RECURRENCE_TIME = '18:00';
/** A month plus the longest holiday (60 days): how far the holiday set reaches. */
const HOLIDAY_LOOKAHEAD_DAYS = 100;

export interface RecurrenceSchedule {
  freq: TaskRecurrenceFreq;
  weekdays: number[];
  dayOfMonth: number | null;
  dueTime: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The DTO's shape → the stored one; a 400 for anything the DTO lets through. */
export function normalizeSchedule(input: {
  freq: TaskRecurrenceFreq;
  weekdays?: number[];
  dayOfMonth?: number;
  dueTime?: string;
}): RecurrenceSchedule {
  const dueTime = input.dueTime ?? DEFAULT_RECURRENCE_TIME;
  // Zero-padded "HH:mm" compares as text.
  if (!HHMM.test(dueTime) || dueTime < '08:00' || dueTime > '22:00') {
    throw new BadRequestException(
      "Vaqt 08:00 dan 22:00 gacha bo'lishi kerak (Toshkent vaqti)",
    );
  }
  if (input.freq === 'WEEKLY') {
    const weekdays = [...new Set(input.weekdays ?? [])].sort((a, b) => a - b);
    const bad = weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 6);
    if (weekdays.length === 0 || bad) {
      throw new BadRequestException(
        'Hafta kunlarini tanlang (dushanbadan shanbagacha)',
      );
    }
    return { freq: 'WEEKLY', weekdays, dayOfMonth: null, dueTime };
  }
  if (input.freq === 'MONTHLY') {
    const d = input.dayOfMonth;
    if (d === undefined || !Number.isInteger(d) || d < 1 || d > 28) {
      throw new BadRequestException("Oy kuni 1 dan 28 gacha bo'lishi kerak");
    }
    return { freq: 'MONTHLY', weekdays: [], dayOfMonth: d, dueTime };
  }
  return { freq: 'DAILY', weekdays: [], dayOfMonth: null, dueTime };
}

export function isWorkingDay(
  day: string,
  holidays: ReadonlySet<string>,
): boolean {
  return dayOfWeekForDateStr(day) !== 0 && !holidays.has(day);
}

function named(s: RecurrenceSchedule, day: string): boolean {
  if (s.freq === 'WEEKLY') return s.weekdays.includes(dayOfWeekForDateStr(day));
  if (s.freq === 'MONTHLY') return Number(day.slice(8, 10)) === s.dayOfMonth;
  return true;
}

/**
 * The first run day strictly after `after`: the first day the rule names,
 * moved past Sundays and the branch's holidays. Pass the LAST run day as
 * `after`, so days pushed onto the same working day make one run.
 */
export function nextRunDateAfter(
  s: RecurrenceSchedule,
  after: string,
  holidays: ReadonlySet<string>,
): string {
  let day = addDaysToDateStr(after, 1);
  // 62 days always reach a named day; the bound only stops a corrupt row.
  for (let i = 0; i < 62 && !named(s, day); i++) day = addDaysToDateStr(day, 1);
  while (!isWorkingDay(day, holidays)) day = addDaysToDateStr(day, 1);
  return day;
}

/** "HH:mm" Tashkent on `day`, as the stored UTC instant. */
export function recurrenceDueAt(day: string, dueTime: string): Date {
  const [h, m] = dueTime.split(':').map(Number);
  return new Date(
    utcMidnightFromDateStr(day).getTime() +
      (h * 60 + m) * 60_000 -
      TASHKENT_OFFSET_MS,
  );
}

/** The first run day (today or later) whose due time is still ahead of `now`. */
export function firstRunDate(
  s: RecurrenceSchedule,
  now: Date,
  holidays: ReadonlySet<string>,
): string {
  const today = tashkentDateStr(now);
  const first = nextRunDateAfter(s, addDaysToDateStr(today, -1), holidays);
  const passed =
    first === today &&
    recurrenceDueAt(today, s.dueTime).getTime() <= now.getTime();
  return passed ? nextRunDateAfter(s, today, holidays) : first;
}

/**
 * Who gets a task on this run (spec §3.6: while the last one is open, no new
 * one). Joint: one task for everyone, none while a task of the rule is open.
 * «Har biriga alohida»: a copy each, except whoever still has an open one.
 * Decided by the rule's flag only — never by how many assignees are left.
 */
export function runGroups(
  separateCopies: boolean,
  assigneeIds: number[],
  openTasks: { assigneeIds: number[] }[],
): number[][] {
  if (assigneeIds.length === 0) return [];
  if (!separateCopies) return openTasks.length ? [] : [assigneeIds];
  const busy = new Set(openTasks.flatMap((t) => t.assigneeIds));
  return assigneeIds.filter((id) => !busy.has(id)).map((id) => [id]);
}

/**
 * The holidays from `today` on, for a rule's branch. A branch-less rule gets
 * every holiday row — the same set the manual due check uses (`TasksService`).
 */
export function recurrenceHolidays(
  db: HolidayDateSetDb,
  branchId: number | null,
  today: string,
): Promise<Set<string>> {
  const from = tashkentDayStartUtc(today);
  return buildHolidayDateSet(
    db,
    from,
    new Date(from.getTime() + HOLIDAY_LOOKAHEAD_DAYS * 864e5),
    branchId ?? undefined,
  );
}
