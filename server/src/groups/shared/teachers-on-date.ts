import { Prisma } from '@prisma/client';
import { tashkentDayStartUtc } from '../../common/date/tashkent';

/**
 * A group's teachers at a lesson (ADR-0144).
 *
 * `GroupTeacher` holds today's roster only. Every roster change writes a
 * `GroupTeacherHistory` row with the whole list before (`previousTeacherIds`)
 * and after it. So the roster at a lesson is the `previousTeacherIds` of the
 * first change made AFTER the lesson started, or today's roster when nothing
 * has changed since. The same rule as the departures report (ADR-0098).
 *
 * The boundary is the lesson's start, not its day: the live accrual is written
 * when the register is saved, the centre top-up at month end, and both must
 * name the same teacher. With a day boundary a change made the same evening
 * after the lesson moved it to the new teacher at month end while the old one
 * had already been paid for it.
 *
 * Reading today's roster paid the new teacher for lessons the old one had
 * taught and been paid for: 22.10.2026 #010 and #011 changed teacher, and the
 * 31.10 payroll fronted 60 student-lessons a second time.
 */

/** The part of a `GroupTeacherHistory` row this rule reads. */
export interface RosterChange {
  groupId: string;
  previousTeacherIds: number[];
  createdAt: Date;
}

/**
 * The UTC instant a lesson starts: its Tashkent day at the group's
 * `lessonStartTime` ('HH:MM'). A group without a start time counts from the
 * day's 00:00, so a change made that day is after its lesson.
 */
export function lessonStartInstant(
  dateStr: string,
  lessonStartTime: string | null | undefined,
): Date {
  const dayStart = tashkentDayStartUtc(dateStr).getTime();
  const m = /^(\d{1,2}):(\d{2})/.exec(lessonStartTime ?? '');
  if (!m) return new Date(dayStart);
  return new Date(dayStart + (Number(m[1]) * 60 + Number(m[2])) * 60_000);
}

/** Pure rule: one group's roster at a lesson that started at `startsAt`. */
export function teachersAtLesson(
  currentRoster: number[],
  changes: RosterChange[],
  startsAt: Date,
): number[] {
  let first: RosterChange | undefined;
  for (const c of changes) {
    if (c.createdAt <= startsAt) continue;
    if (!first || c.createdAt < first.createdAt) first = c;
  }
  return first ? first.previousTeacherIds : currentRoster;
}

/** In-memory resolver for a sweep over many lessons. */
export function buildTeachersOnDate(
  roster: { groupId: string; teacherId: number }[],
  changes: RosterChange[],
  groups: { id: string; lessonStartTime?: string | null }[],
): (groupId: string, dateStr: string) => number[] {
  const rosterBy = new Map<string, number[]>();
  for (const r of roster) {
    rosterBy.set(r.groupId, [...(rosterBy.get(r.groupId) ?? []), r.teacherId]);
  }
  const changesBy = new Map<string, RosterChange[]>();
  for (const c of changes) {
    changesBy.set(c.groupId, [...(changesBy.get(c.groupId) ?? []), c]);
  }
  const startTime = new Map(groups.map((g) => [g.id, g.lessonStartTime]));
  return (groupId, dateStr) =>
    teachersAtLesson(
      rosterBy.get(groupId) ?? [],
      changesBy.get(groupId) ?? [],
      lessonStartInstant(dateStr, startTime.get(groupId)),
    );
}

/**
 * Every roster change, for a sweep. All of them, not the period's: a sweep
 * also reaches lessons of earlier periods (the BR-09b backlog), and a change
 * made between such a lesson and the period start decides its teacher. One
 * row per change, so the table stays small.
 */
export function loadRosterChanges(
  db: Prisma.TransactionClient,
): Promise<RosterChange[]> {
  return db.groupTeacherHistory.findMany({
    select: { groupId: true, previousTeacherIds: true, createdAt: true },
  });
}

/**
 * One lesson's group teachers, substitute override NOT included (callers
 * check it first). `lessonDate` is the `@db.Date` value (UTC midnight).
 */
export async function loadTeachersOnLesson(
  db: Prisma.TransactionClient,
  groupId: string,
  lessonDate: Date,
): Promise<number[]> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { lessonStartTime: true },
  });
  const startsAt = lessonStartInstant(
    lessonDate.toISOString().slice(0, 10),
    group?.lessonStartTime,
  );
  const next = await db.groupTeacherHistory.findFirst({
    where: { groupId, createdAt: { gt: startsAt } },
    orderBy: { createdAt: 'asc' },
    select: { previousTeacherIds: true },
  });
  if (next) return next.previousTeacherIds;
  const roster = await db.groupTeacher.findMany({
    where: { groupId },
    select: { teacherId: true },
  });
  return roster.map((t) => t.teacherId);
}
