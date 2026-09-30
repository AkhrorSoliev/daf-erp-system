import { TASHKENT_OFFSET_MS } from '../../common/date/tashkent';
import { ADMISSION_START_DAY } from '../../billing/lesson-admission';

/**
 * When a NEW register (no attendance rows yet) may be saved — spec
 * 2026-09-29 §3.1, ADR-0054: only on the lesson's own Tashkent day, from the
 * company's lead (`payment.attendanceOpensMinutesBefore`, default ten
 * minutes) before it starts until it ends, for every role, the CEO included.
 * After the end the only way in is the late register, which leaves the
 * teacher unpaid for the lesson. Editing a register that already exists is
 * not governed by this.
 */
export type AttendanceWindow = 'OPEN' | 'BEFORE' | 'ENDED' | 'NOT_TODAY';

/** The default lead; the company's `payment.attendanceOpensMinutesBefore` wins. */
export const OPENS_MINUTES_BEFORE = 10;
/** A group without lesson times is treated as meeting 08:00–23:00. */
export const DAY_START_TIME = '08:00';
export const DAY_END_TIME = '23:00';

export const ENDED_REFUSAL =
  "Dars tugagan — davomat olish yopilgan. Dars bo'lgan-bo'lmaganini «Jadval» yoki «Topshiriqlar»da belgilang";
/**
 * `ENDED_REFUSAL` for a teacher-only caller: the administrator answers «Dars
 * bo'ldimi?», not the teacher (CEO, 01.10) — the same words as the teacher's
 * lesson-end reminder.
 */
export const TEACHER_ENDED_REFUSAL =
  "Dars tugagan — davomat olish yopilgan. Dars bo'lgan-bo'lmaganini administrator belgilaydi.";

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** The Tashkent calendar day and minute-of-day of an instant. */
export function tashkentClock(now: Date = new Date()): {
  todayStr: string;
  nowMinutes: number;
} {
  const shifted = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return {
    todayStr: shifted.toISOString().slice(0, 10),
    nowMinutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Seconds from `now` until `endTime` on today's Tashkent clock; ≤ 0 once it has passed. */
export function secondsUntil(endTime: string, now: Date = new Date()): number {
  const shifted = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const nowSeconds =
    shifted.getUTCHours() * 3600 +
    shifted.getUTCMinutes() * 60 +
    shifted.getUTCSeconds();
  return toMinutes(endTime) * 60 - nowSeconds;
}

/**
 * The times a lesson really runs: a day moved here with its own times uses
 * them, everything else the group's. The ONE place this is decided — the
 * window check, the register's read and the lesson-end sweep all read it, so
 * a moved lesson is opened, shown and closed by the same clock.
 */
export function effectiveLessonTimes(
  group: { lessonStartTime: string | null; lessonEndTime: string | null },
  movedHere:
    | { newLessonStartTime: string | null; newLessonEndTime: string | null }
    | null
    | undefined,
): { startTime: string | null; endTime: string | null } {
  return {
    startTime: movedHere?.newLessonStartTime ?? group.lessonStartTime,
    endTime: movedHere?.newLessonEndTime ?? group.lessonEndTime,
  };
}

export function newAttendanceWindow(args: {
  date: string;
  todayStr: string;
  nowMinutes: number;
  startTime: string | null;
  endTime: string | null;
  opensMinutesBefore?: number;
}): AttendanceWindow {
  if (args.date !== args.todayStr) return 'NOT_TODAY';
  if (args.nowMinutes >= toMinutes(args.endTime ?? DAY_END_TIME))
    return 'ENDED';
  const lead = args.opensMinutesBefore ?? OPENS_MINUTES_BEFORE;
  if (args.startTime && args.nowMinutes < toMinutes(args.startTime) - lead) {
    return 'BEFORE';
  }
  return 'OPEN';
}

export function lessonHasEnded(args: {
  date: string;
  todayStr: string;
  nowMinutes: number;
  endTime: string | null;
}): boolean {
  if (args.date !== args.todayStr) return args.date < args.todayStr;
  return args.nowMinutes >= toMinutes(args.endTime ?? DAY_END_TIME);
}

/**
 * An edit after the lesson (CEO 30.09, D1) keeps contract 3.2 as the lesson
 * saw it. Once a manual save took the register, every student it could mark
 * has a row, so a roster student without one was kept out then (unpaid, or
 * not in the group yet). After the end he stays out: a payment since does
 * not put him in the lesson, and the teacher was told it earns nothing for
 * him. Empty while the lesson runs, and for a register only QR scans took:
 * the first manual save there still marks everyone.
 */
export function leftOutAfterEnd(input: {
  date: string;
  ended: boolean;
  takenManually: boolean;
  unmarkedIds: readonly number[];
}): Set<number> {
  // Only where contract 3.2 kept anyone out: older registers were saved
  // under rules that let a present student go without a row.
  const applies =
    input.date >= ADMISSION_START_DAY && input.ended && input.takenManually;
  return new Set(applies ? input.unmarkedIds : []);
}

/** The Uzbek refusal for a closed window; `null` while it is open. */
export function windowRefusal(
  window: AttendanceWindow,
  args: {
    date: string;
    todayStr: string;
    startTime: string | null;
    opensMinutesBefore?: number;
  },
): string | null {
  switch (window) {
    case 'OPEN':
      return null;
    case 'BEFORE':
      return `Davomat dars boshlanishidan ${args.opensMinutesBefore ?? OPENS_MINUTES_BEFORE} daqiqa oldin ochiladi (${args.startTime})`;
    case 'NOT_TODAY':
      return args.date > args.todayStr
        ? 'Davomat faqat dars kuni olinadi. Kelmaydiganlarni «Oldindan belgilash» bilan belgilang'
        : ENDED_REFUSAL;
    case 'ENDED':
      return ENDED_REFUSAL;
  }
}

/**
 * Whole minutes from the lesson's effective start to `now`, Tashkent time;
 * null when the lesson has no start time or `now` is not past the start of
 * that day's lesson. Used for «N daqiqa kechikdi» (ADR-0048).
 */
export function minutesLate(input: {
  lessonDay: string;
  startTime: string | null;
  now: Date;
}): number | null {
  if (!input.startTime) return null;
  const startUtcMs =
    Date.parse(`${input.lessonDay}T00:00:00.000Z`) -
    TASHKENT_OFFSET_MS +
    toMinutes(input.startTime) * 60_000;
  const minutes = Math.floor((input.now.getTime() - startUtcMs) / 60_000);
  return minutes > 0 ? minutes : null;
}

/** Statuses that say the student is in the lesson. */
const IN_LESSON = new Set(['PRESENT', 'LATE']);

/**
 * The status and minutes a manual save writes for one student (ADR-0048).
 * An administrator marking a student present after the lesson's first save
 * is recording a late arrival: the student becomes LATE with the minutes
 * since the start. A LATE that stays LATE keeps its minutes; any other
 * status clears them. A teacher's save, the lesson's first save, and a
 * student already in the lesson are written as sent.
 */
export function lateArrival(input: {
  lessonAlreadyTaken: boolean;
  savedByTeacherOnly: boolean;
  oldStatus: string | null;
  oldLateMinutes: number | null;
  newStatus: string;
  /** `minutesLate` at the moment of the save. */
  minutesNow: number | null;
}): { status: string; lateMinutes: number | null } {
  const arriving =
    input.lessonAlreadyTaken &&
    !input.savedByTeacherOnly &&
    !IN_LESSON.has(input.oldStatus ?? '') &&
    IN_LESSON.has(input.newStatus);
  if (arriving && input.minutesNow !== null) {
    return { status: 'LATE', lateMinutes: input.minutesNow };
  }
  if (input.newStatus !== 'LATE') {
    return { status: input.newStatus, lateMinutes: null };
  }
  return {
    status: 'LATE',
    lateMinutes: input.oldStatus === 'LATE' ? input.oldLateMinutes : null,
  };
}
