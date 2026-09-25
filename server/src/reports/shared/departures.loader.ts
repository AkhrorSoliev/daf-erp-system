import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ReportBranchIds,
  studentBranchWhere,
} from '../../common/finance/report-branch-scope';
import { getSystemStartDate } from '../../common/finance/system-start-date';
import {
  enrollmentStatusOn,
  type EnrollmentStatusEvent,
} from '../../students/shared/enrollment-status-on';
import {
  buildDepartureEpisodes,
  DEPARTURE_GRACE_DAYS,
  type DepartureEpisode,
  type StopKind,
  type StudentEvent,
} from '../../students/shared/departure-episodes';

type PrismaLike = PrismaService | Prisma.TransactionClient;

export interface LoadedDepartures {
  episodes: DepartureEpisode[];
  /** Students with an ACTIVE enrollment at `activeAt`, moved up to the floor; 0 when not asked. */
  activeAtStart: number;
  /** `Company.systemStartDate` (ADR-0005), or null. */
  floor: Date | null;
  graceDays: number;
}

interface StudentRow {
  id: number;
  status: string;
  statusChangedAt: Date | null;
}

interface EnrollmentRow {
  id: string;
  studentId: number;
  status: string;
  createdAt: Date;
  statusChangedAt: Date | null;
}

interface HistoryRow {
  entityId: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: Date;
}

/** An enrollment closing into one of these did not leave the student groupless. */
const NOT_A_STOP: ReadonlySet<string> = new Set(['COMPLETED', 'TRANSFERRED']);

/**
 * Departure episodes of every student in scope, built from the logs the
 * system already keeps (ADR-0035).
 *
 * Branch scoping is a chain: only the student query carries the branch
 * predicate; every later query reads the ids it returned.
 */
export async function loadDepartures(
  prisma: PrismaLike,
  companyId: number,
  scope: ReportBranchIds,
  opts: { activeAt?: Date; now?: Date } = {},
): Promise<LoadedDepartures> {
  const now = opts.now ?? new Date();
  const graceDays = DEPARTURE_GRACE_DAYS;
  const floor = await getSystemStartDate(prisma, companyId);

  const students: StudentRow[] = await prisma.student.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { not: StudentStatus.PROSPECT },
      ...studentBranchWhere(scope),
    },
    select: { id: true, status: true, statusChangedAt: true },
  });
  if (students.length === 0) {
    return { episodes: [], activeAtStart: 0, floor, graceDays };
  }
  const ids = students.map((s) => s.id);

  const [enrollments, logs, history] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: { in: ids }, deletedAt: null },
      select: {
        id: true,
        studentId: true,
        status: true,
        createdAt: true,
        statusChangedAt: true,
      },
    }),
    prisma.enrollmentStateLog.findMany({
      where: { enrollment: { studentId: { in: ids }, deletedAt: null } },
      select: { enrollmentId: true, status: true, transitionAt: true },
      orderBy: { transitionAt: 'asc' },
    }),
    prisma.statusHistory.findMany({
      where: { entityType: 'Student', entityId: { in: ids.map(String) } },
      select: {
        entityId: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
      },
    }),
  ]);

  const logsByEnrollment = new Map<string, EnrollmentStatusEvent[]>();
  for (const l of logs) {
    const list = logsByEnrollment.get(l.enrollmentId);
    const event = { status: l.status, transitionAt: l.transitionAt };
    if (list) list.push(event);
    else logsByEnrollment.set(l.enrollmentId, [event]);
  }
  for (const list of logsByEnrollment.values()) {
    list.sort((a, b) => a.transitionAt.getTime() - b.transitionAt.getTime());
  }
  // Older writers could close an enrollment without logging it; the row still
  // says how and when, so the log is completed from it.
  for (const e of enrollments) {
    const own = logsByEnrollment.get(e.id);
    if (!own || own.length === 0 || !e.statusChangedAt) continue;
    const last = own[own.length - 1];
    if (
      last.status !== e.status &&
      e.statusChangedAt.getTime() >= last.transitionAt.getTime()
    ) {
      own.push({ status: e.status, transitionAt: e.statusChangedAt });
    }
  }

  const enrollmentsByStudent = groupByKey<EnrollmentRow, number>(
    enrollments,
    (e) => e.studentId,
  );
  const historyByStudent = groupByKey<HistoryRow, number>(history, (h) =>
    Number(h.entityId),
  );
  const activeAt =
    opts.activeAt && floor && floor.getTime() > opts.activeAt.getTime()
      ? floor
      : opts.activeAt;

  const events: StudentEvent[] = [];
  let activeAtStart = 0;
  for (const s of students) {
    const own = enrollmentsByStudent.get(s.id) ?? [];
    const membership = membershipEvents(s.id, own, logsByEnrollment);
    // A student who never sat in a group cannot leave one (ADR-0035), so status
    // changes count only from their first group join.
    const firstJoin = membership.find((e) => e.type === 'RETURN');
    if (firstJoin) {
      events.push(...membership);
      events.push(
        ...statusEvents(s, historyByStudent.get(s.id) ?? []).filter(
          (e) => e.at.getTime() >= firstJoin.at.getTime(),
        ),
      );
    }
    if (
      activeAt &&
      own.some(
        (e) =>
          enrollmentStatusOn(logsByEnrollment.get(e.id), activeAt, e) ===
          'ACTIVE',
      )
    ) {
      activeAtStart += 1;
    }
  }

  return {
    episodes: buildDepartureEpisodes(events, { graceDays, now }),
    activeAtStart,
    floor,
    graceDays,
  };
}

/**
 * Group membership as the union of the student's enrollments: a STOP when
 * the last ACTIVE enrollment closes, a RETURN when one is ACTIVE again.
 * Closing into COMPLETED (graduation) or TRANSFERRED (a new enrollment
 * opened with it) is not a stop.
 */
function membershipEvents(
  studentId: number,
  enrollments: readonly EnrollmentRow[],
  logs: ReadonlyMap<string, EnrollmentStatusEvent[]>,
): StudentEvent[] {
  const instants = new Set<number>();
  for (const e of enrollments) {
    const own = logs.get(e.id);
    if (own && own.length > 0) {
      for (const l of own) instants.add(l.transitionAt.getTime());
    } else {
      instants.add(e.createdAt.getTime());
      if (e.statusChangedAt) instants.add(e.statusChangedAt.getTime());
    }
  }

  const out: StudentEvent[] = [];
  let activeBefore: string[] = [];
  for (const t of [...instants].sort((a, b) => a - b)) {
    const at = new Date(t);
    const statusAt = new Map(
      enrollments.map((e) => [e.id, enrollmentStatusOn(logs.get(e.id), at, e)]),
    );
    const activeNow = enrollments
      .filter((e) => statusAt.get(e.id) === 'ACTIVE')
      .map((e) => e.id);
    if (activeBefore.length > 0 && activeNow.length === 0) {
      const leftForReal = activeBefore.some(
        (id) => !NOT_A_STOP.has(statusAt.get(id) ?? ''),
      );
      if (leftForReal) {
        out.push({ studentId, at, type: 'STOP', kind: 'LEFT_GROUP' });
      }
    } else if (activeBefore.length === 0 && activeNow.length > 0) {
      out.push({ studentId, at, type: 'RETURN' });
    }
    activeBefore = activeNow;
  }
  return out;
}

/** Status stops from StatusHistory, and from the card for legacy data. */
function statusEvents(
  student: StudentRow,
  history: readonly HistoryRow[],
): StudentEvent[] {
  const out: StudentEvent[] = [];
  for (const h of history) {
    const kind = stopKindFor(h.fromStatus, h.toStatus);
    if (kind) {
      out.push({ studentId: student.id, at: h.createdAt, type: 'STOP', kind });
    }
  }
  // A status set before StatusHistory existed. Only EXPELLED and FROZEN are
  // read back from the card: an old ARCHIVED card may be an archived
  // graduate, and its enrollments tell that story anyway.
  const logged = history.some((h) => h.toStatus === student.status);
  const legacyKind: StopKind | null =
    student.status === 'EXPELLED'
      ? 'EXPELLED'
      : student.status === 'FROZEN'
        ? 'FROZEN'
        : null;
  if (!logged && legacyKind && student.statusChangedAt) {
    out.push({
      studentId: student.id,
      at: student.statusChangedAt,
      type: 'STOP',
      kind: legacyKind,
    });
  }
  return out;
}

function stopKindFor(from: string | null, to: string): StopKind | null {
  if (to === 'EXPELLED') return 'EXPELLED';
  if (to === 'FROZEN' && (from === null || from === 'ACTIVE')) return 'FROZEN';
  if (to === 'ARCHIVED' && (from === 'ACTIVE' || from === 'FROZEN')) {
    return 'ARCHIVED';
  }
  return null;
}

function groupByKey<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
