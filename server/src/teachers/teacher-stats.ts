/**
 * A teacher's month-by-month figures for the profile charts — pure math over
 * rows the service has already loaded, so it can be tested without a database.
 *
 * Every figure is read "as the teacher saw it": a group counts for a teacher
 * only while that teacher was on it (`teachersAt`, from `GroupTeacherHistory`),
 * so a group handed over in June leaves the old teacher's line from June on.
 * Departures are ADR-0035's episodes (`loadDepartures`), never a second
 * definition; this file only decides whose group the student left from.
 */
import {
  enrollmentStatusOn,
  supplyClosingRow,
  supplyOpeningRow,
  type EnrollmentStatusEvent,
} from '../students/shared/enrollment-status-on';
import {
  departuresInRange,
  pendingInRange,
  type DepartureEpisode,
} from '../students/shared/departure-episodes';
import {
  addMonthsToMonthKey,
  tashkentDayStartUtc,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';

export interface TeacherStatsMonth {
  /** 'YYYY-MM', Tashkent. */
  month: string;
  /** Earned that month (`SalaryMonthlyService`); null when not shown or unknown. */
  salary: number | null;
  /** Distinct students in the teacher's groups at the month's end (now, for the current month). */
  activeStudents: number;
  /** Distinct students whose enrollment in the teacher's group opened that month. */
  joined: number;
  /** Confirmed departures (ADR-0035) that started that month from the teacher's group. */
  left: number;
  /** Stops of that month still inside their grace period — may yet come back. */
  leftPending: number;
  /** (PRESENT + LATE) ÷ (PRESENT + LATE + ABSENT) of the teacher's lessons; null without lessons. */
  attendancePct: number | null;
}

export interface GroupTeachers {
  /** Today's `GroupTeacher` ids. */
  current: number[];
  /** `GroupTeacherHistory`, NEWEST first. */
  history: { createdAt: Date; previousTeacherIds: number[] }[];
  deletedAt: Date | null;
}

export interface StatsEnrollment {
  groupId: string;
  studentId: number;
  status: string;
  createdAt: Date;
  statusChangedAt: Date | null;
  /** `EnrollmentStateLog`, ascending. */
  log: EnrollmentStatusEvent[];
}

export interface AttendanceCount {
  groupId: string;
  /** 'YYYY-MM-DD' of the `@db.Date` column. */
  date: string;
  status: string;
  count: number;
}

export interface TeacherStatsInput {
  teacherId: number;
  months: string[];
  now: Date;
  groups: Map<string, GroupTeachers>;
  enrollments: StatsEnrollment[];
  attendance: AttendanceCount[];
  episodes: DepartureEpisode[];
  floor: Date | null;
  salaryByMonth: Map<string, number | null>;
}

/** Who taught the group at `at`: today's set, rolled back through every later change. */
export function teachersAt(group: GroupTeachers, at: Date): number[] {
  let set = group.current;
  for (const h of group.history) {
    if (h.createdAt.getTime() <= at.getTime()) break;
    set = h.previousTeacherIds;
  }
  return set;
}

// ponytail: a stop is attributed to the group the student was in a minute
// before it — a status change and its enrollment cascade can be written a few
// milliseconds apart. A student frozen within a minute of joining is missed.
const STOP_LOOKBACK_MS = 60_000;

export function buildTeacherStats(
  input: TeacherStatsInput,
): TeacherStatsMonth[] {
  const { teacherId, groups, now, floor } = input;

  const teaches = (groupId: string, at: Date): boolean => {
    const g = groups.get(groupId);
    return !!g && teachersAt(g, at).includes(teacherId);
  };

  const enrollments = input.enrollments.map((e) => {
    const log = [...e.log];
    supplyOpeningRow(log, e.createdAt);
    supplyClosingRow(log, e);
    return { ...e, log };
  });
  const activeAt = (e: (typeof enrollments)[number], at: Date): boolean => {
    const deletedAt = groups.get(e.groupId)?.deletedAt;
    if (deletedAt && at.getTime() >= deletedAt.getTime()) return false;
    return enrollmentStatusOn(e.log, at, e) === 'ACTIVE';
  };
  const openedAt = (e: (typeof enrollments)[number]): Date =>
    e.log.find((l) => l.status === 'ACTIVE')?.transitionAt ?? e.createdAt;

  const byStudent = new Map<number, typeof enrollments>();
  for (const e of enrollments) {
    const list = byStudent.get(e.studentId);
    if (list) list.push(e);
    else byStudent.set(e.studentId, [e]);
  }
  const leftFromTeacher = (ep: DepartureEpisode): boolean => {
    const at = new Date(ep.startedAt.getTime() - STOP_LOOKBACK_MS);
    return (byStudent.get(ep.studentId) ?? []).some(
      (e) => activeAt(e, at) && teaches(e.groupId, at),
    );
  };

  return input.months.map((month) => {
    const range = tashkentMonthRangeUtc(month);
    const end = new Date(Math.min(range.lt.getTime() - 1, now.getTime()));

    const active = new Set<number>();
    const joined = new Set<number>();
    for (const e of enrollments) {
      if (activeAt(e, end) && teaches(e.groupId, end)) active.add(e.studentId);
      const opened = openedAt(e);
      if (
        opened >= range.gte &&
        opened < range.lt &&
        teaches(e.groupId, opened)
      ) {
        joined.add(e.studentId);
      }
    }

    let attended = 0;
    let scored = 0;
    for (const a of input.attendance) {
      if (!a.date.startsWith(month)) continue;
      // Midday Tashkent: a teacher change made during the day counts from the next one.
      const midday = new Date(
        tashkentDayStartUtc(a.date).getTime() + 12 * 3_600_000,
      );
      if (!teaches(a.groupId, midday)) continue;
      if (a.status === 'PRESENT' || a.status === 'LATE') attended += a.count;
      if (a.status !== 'EXCUSED') scored += a.count;
    }

    return {
      month,
      salary: input.salaryByMonth.get(month) ?? null,
      activeStudents: active.size,
      joined: joined.size,
      left: departuresInRange(input.episodes, range, floor).filter(
        leftFromTeacher,
      ).length,
      leftPending: pendingInRange(input.episodes, range, floor).filter(
        leftFromTeacher,
      ).length,
      attendancePct: scored > 0 ? Math.round((attended / scored) * 100) : null,
    };
  });
}

/** The last `count` Tashkent months up to `current`, none before the reporting floor. */
export function statsMonths(
  current: string,
  floorMonth: string | null,
  count = 6,
): string[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonthsToMonthKey(current, -i);
    if (!floorMonth || m >= floorMonth) months.push(m);
  }
  return months;
}
