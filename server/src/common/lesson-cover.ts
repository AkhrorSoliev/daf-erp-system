import { Prisma } from '@prisma/client';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';

/**
 * When a substitute assignment still counts.
 *
 * A cover is a single day's work, and it should leave the teacher's world the
 * moment that day is over — CEO decision, 2026-08-24: "muddat ertasiga olib
 * tashlanadi". Otherwise one afternoon of covering leaves a group in their
 * list forever, and by the end of a term the list is mostly other people's
 * groups.
 *
 * ONE DEFINITION, used by all three places that ask the question: whether the
 * group appears in the teacher's list, which dates the badge shows, and
 * whether the guard lets them in. Three copies of "is this cover current" is
 * three chances for the list to offer a group the guard then refuses.
 *
 * CONSEQUENCE WORTH KNOWING: the register must be marked on the day. A
 * substitute who forgets loses the group overnight and the front desk has to
 * enter it — which is the situation this whole change set out to fix, just
 * narrowed to people who forget. If that turns out to bite, the fix is to
 * widen the window here, in this one function.
 */
export function currentCoverWhere(
  teacherId: number,
  now: Date = new Date(),
): Prisma.LessonTeacherOverrideWhereInput {
  return {
    deletedAt: null,
    teacherIds: { has: teacherId },
    // Lesson dates are stored at UTC midnight of the TASHKENT day, so the
    // floor has to be built the same way — comparing against a raw `new Date()`
    // would drop today's own cover for the first five hours of every UTC day.
    date: { gte: coverFloor(now) },
  };
}

/** UTC midnight of today in Tashkent — the oldest cover still in force. */
export function coverFloor(now: Date = new Date()): Date {
  return utcMidnightFromDateStr(tashkentDateStr(now));
}

/** True when a lesson date is today or later in Tashkent. */
export function isCoverCurrent(
  lessonDate: Date,
  now: Date = new Date(),
): boolean {
  return lessonDate.getTime() >= coverFloor(now).getTime();
}
