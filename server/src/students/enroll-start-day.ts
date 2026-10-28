import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  lessonsOn,
  type SweepGroup,
  type SweepReschedule,
} from '../attendance/shared/ended-lessons';
import {
  tashkentClock,
  toMinutes,
} from '../attendance/shared/attendance-window';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';

/** How far ahead the next lesson is looked for (a group is never idle longer). */
const NEXT_LESSON_HORIZON_DAYS = 60;

export const TODAY_LESSON_ANSWER_REQUIRED =
  "Bugungi dars o'tib bo'lgan: o'quvchi unda bo'lganmi, ko'rsating";
export const NO_NEXT_LESSON =
  "Guruhning keyingi darsi yo'q — o'quvchini bugundan qo'shing yoki sanani qo'lda tanlang";

/**
 * Whether the student must be asked "were you at today's lesson?" before the
 * enrollment starts today. Needed only when today holds a lesson of the group
 * that has already ended: the enrollment's start day is billed and sits on the
 * register, so a lesson the student missed would otherwise be charged to them.
 */
export type TodayLessonQuestion =
  | { needed: false }
  | {
      needed: true;
      startTime: string;
      endTime: string;
      /** The group's next lesson day after today; null when it has none. */
      nextLessonDate: string | null;
    };

export interface TodayLessonInput {
  todayStr: string;
  nowMinutes: number;
  /** The enrollment's start day (Tashkent), today when none was picked. */
  startDay: string;
  group: SweepGroup;
  /** Moves touching today or the days ahead. */
  reschedules: SweepReschedule[];
  /** Days (`YYYY-MM-DD`) on which the group's lesson is cancelled. */
  cancelledDays: ReadonlySet<string>;
  /** Holiday days of the group's branch. */
  holidays: ReadonlySet<string>;
}

/** Pure: the whole rule, no clock and no database. */
export function todayLessonQuestion(
  input: TodayLessonInput,
): TodayLessonQuestion {
  const { todayStr, group } = input;
  if (input.startDay !== todayStr) return { needed: false };

  const lessonsAt = (dayStr: string) =>
    lessonsOn({
      dayStr,
      groups: [group],
      reschedules: input.reschedules,
      cancelledGroupIds: input.cancelledDays.has(dayStr)
        ? new Set([group.id])
        : new Set(),
      isHoliday: () => input.holidays.has(dayStr),
    });

  const [today] = lessonsAt(todayStr);
  if (!today || input.nowMinutes < toMinutes(today.endTime)) {
    return { needed: false };
  }

  let nextLessonDate: string | null = null;
  for (let i = 1; i <= NEXT_LESSON_HORIZON_DAYS; i++) {
    const day = addDaysToDateStr(todayStr, i);
    if (lessonsAt(day).length > 0) {
      nextLessonDate = day;
      break;
    }
  }
  return {
    needed: true,
    startTime: today.startTime,
    endTime: today.endTime,
    nextLessonDate,
  };
}

type Db = Pick<
  PrismaClient,
  'lessonReschedule' | 'lessonCancellation' | 'holiday'
>;

/**
 * Loads the group's moves, cancellations and holidays and applies
 * `todayLessonQuestion`. `startDay` is the picked start day, or null for
 * "today".
 */
export async function loadTodayLessonQuestion(
  db: Db,
  group: SweepGroup,
  startDay: string | null,
  now: Date = new Date(),
): Promise<TodayLessonQuestion> {
  const { todayStr, nowMinutes } = tashkentClock(now);
  if ((startDay ?? todayStr) !== todayStr) return { needed: false };

  const from = utcMidnightFromDateStr(todayStr);
  const to = utcMidnightFromDateStr(
    addDaysToDateStr(todayStr, NEXT_LESSON_HORIZON_DAYS),
  );
  const [reschedules, cancellations, holidays] = await Promise.all([
    db.lessonReschedule.findMany({
      where: {
        groupId: group.id,
        deletedAt: null,
        OR: [
          { originalDate: { gte: from, lte: to } },
          { newDate: { gte: from, lte: to } },
        ],
      },
      select: {
        groupId: true,
        originalDate: true,
        newDate: true,
        newLessonStartTime: true,
        newLessonEndTime: true,
      },
    }),
    db.lessonCancellation.findMany({
      where: {
        groupId: group.id,
        deletedAt: null,
        date: { gte: from, lte: to },
      },
      select: { date: true },
    }),
    buildHolidayDateSet(db, from, to, group.branchId),
  ]);

  return todayLessonQuestion({
    todayStr,
    nowMinutes,
    startDay: todayStr,
    group,
    reschedules,
    cancelledDays: new Set(cancellations.map((c) => tashkentDateStr(c.date))),
    holidays,
  });
}

/**
 * The start day an enrollment gets, as a Tashkent `YYYY-MM-DD`: the picked
 * day, today when none, and — when today's lesson is over and the student
 * missed it — the group's next lesson day.
 */
export function startDayFor(
  question: TodayLessonQuestion,
  startDay: string | null,
  todayStr: string,
  attendedTodayLesson: boolean | undefined,
): string {
  if (!question.needed) return startDay ?? todayStr;
  if (attendedTodayLesson === undefined) {
    throw new BadRequestException(TODAY_LESSON_ANSWER_REQUIRED);
  }
  if (attendedTodayLesson) return todayStr;
  if (!question.nextLessonDate) throw new BadRequestException(NO_NEXT_LESSON);
  return question.nextLessonDate;
}
