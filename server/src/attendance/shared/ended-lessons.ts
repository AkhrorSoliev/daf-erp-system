import { tashkentDateStr } from '../../common/date/tashkent';
import { DAY_NAME_TO_JS } from './date-utils';
import {
  DAY_END_TIME,
  DAY_START_TIME,
  effectiveLessonTimes,
  toMinutes,
} from './attendance-window';

export interface SweepGroup {
  id: string;
  name: string;
  companyId: number;
  branchId: number;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface SweepReschedule {
  groupId: string;
  originalDate: Date;
  newDate: Date;
  newLessonStartTime: string | null;
  newLessonEndTime: string | null;
}

export interface EndedLesson {
  groupId: string;
  groupName: string;
  companyId: number;
  branchId: number;
  startTime: string;
  endTime: string;
}

/** A `@db.Date` value (UTC midnight) as its calendar day. */
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Whether a group meeting on `exactDays` has its weekly lesson on `dayStr`. */
export function meetsOn(exactDays: string[], dayStr: string): boolean {
  const weekday = new Date(`${dayStr}T00:00:00.000Z`).getUTCDay();
  return exactDays.some((d) => DAY_NAME_TO_JS[d.toLowerCase()] === weekday);
}

/**
 * The lessons on `dayStr`, by the notion of a lesson day attendance
 * validation uses: the weekly schedule, minus a day cancelled or moved away,
 * plus a day moved here (timed by the move), inside the group's date range,
 * never on a holiday. Pure, so the lesson-end sweep, a move change that
 * closes its old make-up day's question, and their tests share one rule.
 */
export function lessonsOn(args: {
  dayStr: string;
  groups: SweepGroup[];
  reschedules: SweepReschedule[];
  cancelledGroupIds: ReadonlySet<string>;
  isHoliday: (branchId: number) => boolean;
}): EndedLesson[] {
  const movedAway = new Set<string>();
  const movedHere = new Map<string, SweepReschedule>();
  for (const r of args.reschedules) {
    if (dayOf(r.originalDate) === args.dayStr) movedAway.add(r.groupId);
    if (dayOf(r.newDate) === args.dayStr) movedHere.set(r.groupId, r);
  }

  const lessons: EndedLesson[] = [];
  for (const g of args.groups) {
    if (args.cancelledGroupIds.has(g.id) || args.isHoliday(g.branchId))
      continue;
    if (g.startDate && args.dayStr < tashkentDateStr(g.startDate)) continue;
    if (g.endDate && args.dayStr > tashkentDateStr(g.endDate)) continue;

    const moved = movedHere.get(g.id);
    const scheduled = meetsOn(g.exactDays, args.dayStr);
    if (!moved && (!scheduled || movedAway.has(g.id))) continue;

    const times = effectiveLessonTimes(g, moved);
    lessons.push({
      groupId: g.id,
      groupName: g.name,
      companyId: g.companyId,
      branchId: g.branchId,
      startTime: times.startTime ?? DAY_START_TIME,
      endTime: times.endTime ?? DAY_END_TIME,
    });
  }
  return lessons;
}

/** Today's lessons (`lessonsOn`) that have ended by `nowMinutes`. */
export function endedLessonsOn(args: {
  todayStr: string;
  nowMinutes: number;
  groups: SweepGroup[];
  reschedules: SweepReschedule[];
  cancelledGroupIds: ReadonlySet<string>;
  isHoliday: (branchId: number) => boolean;
}): EndedLesson[] {
  return lessonsOn({ ...args, dayStr: args.todayStr }).filter(
    (lesson) => args.nowMinutes >= toMinutes(lesson.endTime),
  );
}
