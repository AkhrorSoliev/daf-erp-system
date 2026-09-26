import { EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  branchIdWhere,
  ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import {
  supplyClosingRow,
  type EnrollmentStatusEvent,
} from '../../students/shared/enrollment-status-on';

/**
 * Who "left" within 5 lessons of a teacher change — the one reader behind the
 * retention card's count (`ReportsDepartedStudentsService`) and its drill-down
 * list (`ReportsTeacherChangesService`), so the two cannot disagree.
 *
 * The window runs from the change to the 5th distinct `Attendance` date after
 * it (the system has no Lesson model). An enrollment of the group opened
 * before the change counts when it is DROPPED or FROZEN now and its current
 * absence started inside the window — once, for the earliest such change.
 *
 * When the absence started is read from `EnrollmentStateLog`
 * (`currentStopStart`), not from `statusChangedAt`. That column moves with
 * every later transition: closing a FROZEN enrollment afterwards (the student
 * expelled or archived, or the group closing) took a student who froze inside
 * the window out of it, and put a student frozen before the change into the
 * window of the day their enrollment was closed.
 *
 * This stays per enrollment on purpose: a return through another enrollment,
 * and how long a stop may last before it is a departure, belong to the
 * student-level definition of a departed student, not to this report.
 */

export type StoppedStatus = 'DROPPED' | 'FROZEN';

const LESSON_WINDOW = 5;

const isStop = (status: string): status is StoppedStatus =>
  status === 'DROPPED' || status === 'FROZEN';

export interface StopEpisodeInput {
  status: EnrollmentStatus;
  statusChangedAt: Date | null;
  stateLog: readonly EnrollmentStatusEvent[];
}

/**
 * When the enrollment's current absence started: its earliest FROZEN or
 * DROPPED log row after its last ACTIVE row. A freeze closed later is dated
 * by the freeze; a stop after a return is dated by that stop, not by the one
 * before the return. `null` when the enrollment is not DROPPED or FROZEN now.
 *
 * The log is read the way the departures loader reads it: a closing that was
 * never logged is completed from the row (`supplyClosingRow`), and an
 * enrollment with no log rows is read from its own columns, as
 * `enrollmentStatusOn` reads it. A missing opening row changes nothing here:
 * the absence starts after the last ACTIVE row either way.
 */
export function currentStopStart(
  enrollment: StopEpisodeInput,
): { at: Date; status: StoppedStatus } | null {
  if (!isStop(enrollment.status)) return null;
  if (enrollment.stateLog.length === 0) {
    const since = enrollment.statusChangedAt;
    return since ? { at: since, status: enrollment.status } : null;
  }
  const log = [...enrollment.stateLog].sort(
    (a, b) => a.transitionAt.getTime() - b.transitionAt.getTime(),
  );
  supplyClosingRow(log, enrollment);
  let lastActive = -1;
  log.forEach((row, i) => {
    if (row.status === 'ACTIVE') lastActive = i;
  });
  for (const row of log.slice(lastActive + 1)) {
    if (isStop(row.status)) return { at: row.transitionAt, status: row.status };
  }
  return null;
}

export interface TeacherChange {
  id: string;
  groupId: string;
  createdAt: Date;
  previousTeacherIds: number[];
  newTeacherIds: number[];
}

export interface TeacherChangeDeparture {
  /** The earliest teacher change whose window holds the departure. */
  change: TeacherChange;
  enrollment: {
    id: string;
    studentId: number;
    student: { firstName: string; lastName: string };
    group: { name: string; branch: { name: string } };
    departureReason: { name: string } | null;
  };
  /** Start of the current absence (`currentStopStart`). */
  departedAt: Date;
  departureStatus: StoppedStatus;
  /** 1-based: the window's first lesson on or after `departedAt`. */
  lessonNumber: number;
}

/**
 * Teacher changes in `[start, end)` of the groups in `scope` (`null`: every
 * branch) and the departures within 5 lessons of them. `changes` includes
 * changes with no lesson after them yet; they have no window, so no
 * departures.
 */
export async function loadTeacherChangeDepartures(
  prisma: PrismaService,
  companyId: number,
  params: { scope: ReportBranchIds; start: Date; end: Date },
): Promise<{ changes: TeacherChange[]; departures: TeacherChangeDeparture[] }> {
  const changes = await prisma.groupTeacherHistory.findMany({
    where: {
      createdAt: { gte: params.start, lt: params.end },
      group: { companyId, deletedAt: null, ...branchIdWhere(params.scope) },
    },
    select: {
      id: true,
      groupId: true,
      createdAt: true,
      previousTeacherIds: true,
      newTeacherIds: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const windows: { change: TeacherChange; lessonDates: Date[] }[] = [];
  for (const change of changes) {
    const lessons = await prisma.attendance.findMany({
      where: { groupId: change.groupId, date: { gte: change.createdAt } },
      distinct: ['date'],
      select: { date: true },
      orderBy: { date: 'asc' },
      take: LESSON_WINDOW,
    });
    if (lessons.length > 0) {
      windows.push({ change, lessonDates: lessons.map((l) => l.date) });
    }
  }
  if (windows.length === 0) return { changes, departures: [] };

  const enrollments = await prisma.enrollment.findMany({
    where: {
      groupId: { in: [...new Set(windows.map((w) => w.change.groupId))] },
      status: { in: ['DROPPED', 'FROZEN'] },
      deletedAt: null,
      student: { companyId, deletedAt: null },
    },
    select: {
      id: true,
      studentId: true,
      groupId: true,
      status: true,
      createdAt: true,
      statusChangedAt: true,
      student: { select: { firstName: true, lastName: true } },
      group: { select: { name: true, branch: { select: { name: true } } } },
      departureReason: { select: { name: true } },
      stateLog: { select: { status: true, transitionAt: true } },
    },
  });

  const stoppedByGroup = new Map<
    string,
    {
      e: (typeof enrollments)[number];
      stop: NonNullable<ReturnType<typeof currentStopStart>>;
    }[]
  >();
  for (const e of enrollments) {
    const stop = currentStopStart(e);
    if (!stop) continue;
    const list = stoppedByGroup.get(e.groupId);
    if (list) list.push({ e, stop });
    else stoppedByGroup.set(e.groupId, [{ e, stop }]);
  }

  const departures: TeacherChangeDeparture[] = [];
  const counted = new Set<string>();
  // Changes come oldest first, so a stop inside two windows counts for the
  // earlier change.
  for (const { change, lessonDates } of windows) {
    const from = change.createdAt.getTime();
    const to = lessonDates[lessonDates.length - 1].getTime();
    for (const { e, stop } of stoppedByGroup.get(change.groupId) ?? []) {
      const t = stop.at.getTime();
      if (counted.has(e.id) || e.createdAt.getTime() >= from) continue;
      if (t < from || t > to) continue;
      counted.add(e.id);
      departures.push({
        change,
        enrollment: {
          id: e.id,
          studentId: e.studentId,
          student: e.student,
          group: e.group,
          departureReason: e.departureReason,
        },
        departedAt: stop.at,
        departureStatus: stop.status,
        lessonNumber: lessonDates.findIndex((d) => d.getTime() >= t) + 1,
      });
    }
  }
  return { changes, departures };
}
