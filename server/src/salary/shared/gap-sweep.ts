import { perLessonAccrual, type RateVersion } from './deserved-math';
import { NEW_STUDENT_TOPUP_MIN_LESSONS } from './topup';

/**
 * Lessons the center will have to front, one row per (lesson × teacher).
 *
 * A held lesson earns the teacher whether or not the student paid. When the
 * student has NOT paid, no accrual exists yet and the payroll cron writes a
 * center-funded one at month end. Until then the exposure is a forecast — real
 * money the center is about to spend, visible before it is spent.
 *
 * This is the one implementation of which lessons qualify. `getMonthly` sums it
 * by TEACHER (the payroll column) and the center top-up drill-down sums it by
 * STUDENT (who to collect from). Two copies of these four exclusions would
 * drift, and the drift would be a payroll figure disagreeing with the list of
 * people it is owed by.
 */
export interface GapLesson {
  attendanceId: string;
  studentId: number;
  groupId: string;
  teacherId: number;
  lessonDate: Date;
  /** What the teacher earns for it — the center's cost. */
  amount: number;
  /** Full lesson price, frozen from the course at sweep time. */
  perLessonCost: number;
}

export interface GapSweepInput {
  attendances: Array<{
    id: string;
    studentId: number;
    groupId: string;
    date: Date;
  }>;
  /** groupId → course pricing. Missing group ⇒ the lesson is skipped. */
  groupMap: Map<string, { course: { price: number; lessonPaymentCount: number } }>;
  /** Teachers credited for a lesson, honouring substitute overrides. */
  resolveTeachers: (groupId: string, dateStr: string) => number[];
  /** Active rate for that teacher, group and date; null ⇒ no rate to apply. */
  resolveRate: (
    teacherId: number,
    groupId: string,
    at: Date,
  ) => RateVersion | null;
  /** Teacher ids in scope. Anyone else is outside the branch/search page. */
  inScope: (teacherId: number) => boolean;
  /** Attendance ids that already carry an accrual for that teacher. */
  isCovered: (teacherId: number, attendanceId: string) => boolean;
  /** Flat-salary teachers earn no per-lesson gap. */
  isFixedMonthly: (teacherId: number) => boolean;
  /** `studentId::groupId` → attended lessons so far (BR-09 gate). */
  heldByStudentGroup: Map<string, number>;
  /** studentId → Tashkent date they went inactive, if they did. */
  inactiveSince: Map<number, string>;
  /** "YYYY-MM-DD" of a `@db.Date`, shared with the caller so both agree. */
  dateStr: (d: Date) => string;
}

export interface GapSweepResult {
  lessons: GapLesson[];
  /**
   * Lessons skipped because no rate version covered them. Counted, never
   * priced: fabricating a rate is the May 2026 signature, where configs only
   * became effective in June and every earlier lesson would have been invented.
   */
  noConfigUnits: Map<number, number>;
}

export function sweepGapLessons(input: GapSweepInput): GapSweepResult {
  const lessons: GapLesson[] = [];
  const noConfigUnits = new Map<number, number>();

  for (const att of input.attendances) {
    const g = input.groupMap.get(att.groupId);
    if (!g) continue;

    // BR-09: withhold the new-student top-up until they have attended enough
    // lessons in this group — mirrors the cron, so the shown gap equals what
    // will actually be paid.
    const held =
      input.heldByStudentGroup.get(`${att.studentId}::${att.groupId}`) ?? 0;
    if (held < NEW_STUDENT_TOPUP_MIN_LESSONS) continue;

    // No top-up for a lesson held after the student went inactive.
    const inactiveDay = input.inactiveSince.get(att.studentId);
    const dStr = input.dateStr(att.date);
    if (inactiveDay !== undefined && dStr > inactiveDay) continue;

    const lpc = g.course.lessonPaymentCount || 12;
    const perLessonCost = Math.round(g.course.price / lpc);

    for (const teacherId of input.resolveTeachers(att.groupId, dStr)) {
      if (!input.inScope(teacherId)) continue;
      if (input.isCovered(teacherId, att.id)) continue;
      if (input.isFixedMonthly(teacherId)) continue;

      const v = input.resolveRate(teacherId, att.groupId, att.date);
      if (!v) {
        noConfigUnits.set(teacherId, (noConfigUnits.get(teacherId) ?? 0) + 1);
        continue;
      }
      lessons.push({
        attendanceId: att.id,
        studentId: att.studentId,
        groupId: att.groupId,
        teacherId,
        lessonDate: att.date,
        amount: perLessonAccrual(v, perLessonCost, lpc),
        perLessonCost,
      });
    }
  }

  return { lessons, noConfigUnits };
}
