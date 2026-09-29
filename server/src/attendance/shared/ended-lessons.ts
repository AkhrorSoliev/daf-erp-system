import { tashkentDateStr } from '../../common/date/tashkent';
import { DAY_NAME_TO_JS } from './date-utils';
import { DAY_END_TIME, DAY_START_TIME, toMinutes } from './attendance-window';

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

/**
 * Today's lessons that have ended by `nowMinutes`, by the notion of a lesson
 * day attendance validation uses: the weekly schedule, minus a day cancelled
 * or moved away, plus a day moved here (timed by the move), inside the
 * group's date range, never on a holiday. Pure, so the lesson-end sweep and
 * its tests share one rule.
 */
export function endedLessonsOn(args: {
  todayStr: string;
  nowMinutes: number;
  groups: SweepGroup[];
  reschedules: SweepReschedule[];
  cancelledGroupIds: ReadonlySet<string>;
  isHoliday: (branchId: number) => boolean;
}): EndedLesson[] {
  const weekday = new Date(`${args.todayStr}T00:00:00.000Z`).getUTCDay();
  const movedAway = new Set<string>();
  const movedHere = new Map<string, SweepReschedule>();
  for (const r of args.reschedules) {
    if (dayOf(r.originalDate) === args.todayStr) movedAway.add(r.groupId);
    if (dayOf(r.newDate) === args.todayStr) movedHere.set(r.groupId, r);
  }

  const ended: EndedLesson[] = [];
  for (const g of args.groups) {
    if (args.cancelledGroupIds.has(g.id) || args.isHoliday(g.branchId))
      continue;
    if (g.startDate && args.todayStr < tashkentDateStr(g.startDate)) continue;
    if (g.endDate && args.todayStr > tashkentDateStr(g.endDate)) continue;

    const moved = movedHere.get(g.id);
    const scheduled = g.exactDays.some(
      (d) => DAY_NAME_TO_JS[d.toLowerCase()] === weekday,
    );
    if (!moved && (!scheduled || movedAway.has(g.id))) continue;

    const startTime =
      moved?.newLessonStartTime ?? g.lessonStartTime ?? DAY_START_TIME;
    const endTime = moved?.newLessonEndTime ?? g.lessonEndTime ?? DAY_END_TIME;
    if (args.nowMinutes < toMinutes(endTime)) continue;

    ended.push({
      groupId: g.id,
      groupName: g.name,
      companyId: g.companyId,
      branchId: g.branchId,
      startTime,
      endTime,
    });
  }
  return ended;
}
