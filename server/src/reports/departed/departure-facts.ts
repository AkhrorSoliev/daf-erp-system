import {
  enrollmentStatusOn,
  supplyClosingRow,
  supplyOpeningRow,
  type EnrollmentStatusEvent,
} from '../../students/shared/enrollment-status-on';
import type {
  DepartureEpisode,
  StopKind,
} from '../../students/shared/departure-episodes';
import type {
  DepartureFact,
  NamedId,
  Placement,
  StartMember,
} from './departed.types';

export const NO_REASON = 'Sabab yozilmagan';
const MS_PER_MONTH = 24 * 60 * 60 * 1000 * 30.44;

export interface GroupInput {
  id: string;
  name: string;
  course: NamedId;
  branch: NamedId<number>;
  /** Today's teachers of the group. */
  teacherIds: number[];
}

export interface EnrollmentInput {
  id: string;
  status: string;
  createdAt: Date;
  startDate: Date | null;
  statusChangedAt: Date | null;
  statusChangeReason: string | null;
  departureReason: { id: string; name: string } | null;
  stateLog: EnrollmentStatusEvent[];
  group: GroupInput | null;
}

export interface CardInput {
  status: string;
  statusChangeReason: string | null;
  statusExitReason: { id: string; name: string } | null;
}

export interface StudentInput {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  card: CardInput;
  enrollments: EnrollmentInput[];
}

export interface TeacherChangeRow {
  createdAt: Date;
  previousTeacherIds: number[];
}

export interface FactContext {
  /** Teacher changes of each group, ascending by time. */
  teacherChangesByGroup: ReadonlyMap<string, readonly TeacherChangeRow[]>;
  teacherName: ReadonlyMap<number, string>;
}

function latestBy<T>(items: readonly T[], at: (item: T) => Date): T {
  return items.reduce((best, x) =>
    at(x).getTime() > at(best).getTime() ? x : best,
  );
}

/**
 * The enrollment the student stopped in: the one ACTIVE or FROZEN just before
 * the stop (the newest if several); else the one closed latest before it;
 * else the newest one opened before it. `null` without enrollments.
 */
export function pickEnrollmentAt(
  enrollments: readonly EnrollmentInput[],
  at: Date,
): EnrollmentInput | null {
  if (enrollments.length === 0) return null;
  const before = new Date(at.getTime() - 1);
  const live = enrollments.filter((e) => {
    const log = [...e.stateLog].sort(
      (a, b) => a.transitionAt.getTime() - b.transitionAt.getTime(),
    );
    supplyOpeningRow(log, e.createdAt);
    supplyClosingRow(log, e);
    const status = enrollmentStatusOn(log, before, e);
    return status === 'ACTIVE' || status === 'FROZEN';
  });
  if (live.length > 0) return latestBy(live, (e) => e.createdAt);
  const closed = enrollments.filter(
    (e) => e.statusChangedAt && e.statusChangedAt.getTime() <= at.getTime(),
  );
  if (closed.length > 0) {
    return latestBy(closed, (e) => e.statusChangedAt as Date);
  }
  const opened = enrollments.filter(
    (e) => e.createdAt.getTime() <= at.getTime(),
  );
  return opened.length > 0 ? latestBy(opened, (e) => e.createdAt) : null;
}

/**
 * The teachers a group had at `at`: the first change after that moment says
 * who they were before it; no later change means today's teachers.
 */
export function teacherIdsAt(
  currentIds: number[],
  changesAsc: readonly TeacherChangeRow[],
  at: Date,
): number[] {
  const next = changesAsc.find((c) => c.createdAt.getTime() > at.getTime());
  return next ? next.previousTeacherIds : currentIds;
}

/**
 * Why the student stopped, read where the stop was written: an expulsion or
 * a freeze on the card (while the card still has that status), leaving a
 * group on the enrollment that closed.
 */
export function reasonOf(
  kind: StopKind,
  card: CardInput,
  enrollment: EnrollmentInput | null,
): { id: string | null; name: string; comment: string | null } {
  const fromCard = card.statusExitReason
    ? {
        id: card.statusExitReason.id,
        name: card.statusExitReason.name,
        comment: card.statusChangeReason,
      }
    : null;
  const fromEnrollment = enrollment?.departureReason
    ? {
        id: enrollment.departureReason.id,
        name: enrollment.departureReason.name,
        comment: enrollment.statusChangeReason,
      }
    : null;
  const cardSpeaks =
    (kind === 'EXPELLED' && card.status === 'EXPELLED') ||
    (kind === 'FROZEN' && card.status === 'FROZEN');
  const picked = cardSpeaks ? (fromCard ?? fromEnrollment) : fromEnrollment;
  return picked ?? { id: null, name: NO_REASON, comment: null };
}

/**
 * From the student's very first enrollment to the stop, in months. The first
 * enrollment is dated like the old summary did: the earliest `startDate`,
 * else the earliest `createdAt` — marketing reads the same number.
 */
export function studyMonthsOf(
  enrollments: readonly { startDate: Date | null; createdAt: Date }[],
  departedAt: Date,
): number | null {
  const starts = enrollments
    .map((e) => e.startDate)
    .filter((d): d is Date => d !== null);
  const pool = starts.length > 0 ? starts : enrollments.map((e) => e.createdAt);
  if (pool.length === 0) return null;
  const first = Math.min(...pool.map((d) => d.getTime()));
  const ms = departedAt.getTime() - first;
  return ms > 0 ? ms / MS_PER_MONTH : null;
}

function placementOf(
  group: GroupInput | null,
  at: Date,
  ctx: FactContext,
): Placement {
  if (!group) return { group: null, course: null, branch: null, teachers: [] };
  const ids = teacherIdsAt(
    group.teacherIds,
    ctx.teacherChangesByGroup.get(group.id) ?? [],
    at,
  );
  return {
    group: { id: group.id, name: group.name },
    course: group.course,
    branch: group.branch,
    teachers: ids.flatMap((id) => {
      const fullName = ctx.teacherName.get(id);
      return fullName ? [{ id, fullName }] : [];
    }),
  };
}

export function buildFact(
  ep: DepartureEpisode,
  s: StudentInput,
  ctx: FactContext,
): DepartureFact {
  const enrollment = pickEnrollmentAt(s.enrollments, ep.startedAt);
  const reason = reasonOf(ep.stopKind, s.card, enrollment);
  return {
    key: `${s.id}:${ep.startedAt.getTime()}`,
    studentId: s.id,
    fullName: `${s.firstName} ${s.lastName}`,
    phone: s.phone,
    balance: s.balance,
    startedAt: ep.startedAt,
    stopKind: ep.stopKind,
    state: ep.state,
    returnedAt: ep.returnedAt,
    reason: { id: reason.id, name: reason.name },
    comment: reason.comment,
    studyMonths: studyMonthsOf(s.enrollments, ep.startedAt),
    ...placementOf(enrollment?.group ?? null, ep.startedAt, ctx),
  };
}

export function buildStartMember(
  enrollmentId: string,
  s: StudentInput,
  at: Date,
  ctx: FactContext,
): StartMember {
  const enrollment = s.enrollments.find((e) => e.id === enrollmentId) ?? null;
  return {
    studentId: s.id,
    ...placementOf(enrollment?.group ?? null, at, ctx),
  };
}
